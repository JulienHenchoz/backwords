export async function decodeToBuffer(blob, audioContext) {
  const arrayBuffer = await blob.arrayBuffer()
  return audioContext.decodeAudioData(arrayBuffer)
}

export function reverseBuffer(audioBuffer, audioContext) {
  const reversed = audioContext.createBuffer(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  )

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const source = audioBuffer.getChannelData(channel)
    const target = reversed.getChannelData(channel)
    for (let i = 0, j = source.length - 1; i < source.length; i++, j--) {
      target[i] = source[j]
    }
  }

  return reversed
}

export function playBuffer(audioBuffer, audioContext) {
  return new Promise((resolve) => {
    const source = audioContext.createBufferSource()
    source.buffer = audioBuffer
    source.connect(audioContext.destination)
    source.onended = () => resolve()
    source.start()
  })
}
