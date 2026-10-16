import { withTimeout } from './audioReverse'

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}

export function audioBufferToWavBlob(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels
  const sampleRate = audioBuffer.sampleRate
  const bitDepth = 16
  const bytesPerSample = bitDepth / 8
  const blockAlign = numChannels * bytesPerSample
  const length = audioBuffer.length

  const interleaved = new Float32Array(length * numChannels)
  for (let channel = 0; channel < numChannels; channel++) {
    const data = audioBuffer.getChannelData(channel)
    for (let i = 0; i < length; i++) {
      interleaved[i * numChannels + channel] = data[i]
    }
  }

  const dataSize = interleaved.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < interleaved.length; i++, offset += bytesPerSample) {
    const sample = Math.max(-1, Math.min(1, interleaved[i]))
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function slugify(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase()
}

function renderOffline(context) {
  // Forme événementielle : plus fiable que la Promise sur les vieux Safari.
  return new Promise((resolve, reject) => {
    context.oncomplete = (event) => resolve(event.renderedBuffer)
    try {
      const maybePromise = context.startRendering()
      if (maybePromise && typeof maybePromise.catch === 'function') maybePromise.catch(reject)
    } catch (err) {
      reject(err)
    }
  })
}

// WAV mono 22,05 kHz pour l'upload : ~660 Ko pour 15 s, lisible partout
// (contrairement au webm/opus ou au mp4 produits selon le navigateur).
export async function audioBufferToCompactWavBlob(audioBuffer, sampleRate = 22050) {
  const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext
  if (!OfflineContext) return audioBufferToWavBlob(audioBuffer)
  try {
    const length = Math.max(1, Math.ceil(audioBuffer.duration * sampleRate))
    const context = new OfflineContext(1, length, sampleRate)
    const source = context.createBufferSource()
    source.buffer = audioBuffer
    source.connect(context.destination)
    source.start(0)
    const rendered = await withTimeout(renderOffline(context), 10000, 'Conversion audio trop longue')
    return audioBufferToWavBlob(rendered)
  } catch {
    return audioBufferToWavBlob(audioBuffer)
  }
}
