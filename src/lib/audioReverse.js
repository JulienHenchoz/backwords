export function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

export async function decodeToBuffer(blob, audioContext) {
  const arrayBuffer = await blob.arrayBuffer()
  // La forme "callback" est utilisée volontairement : sur certaines versions
  // de Safari iOS, la forme basée sur une Promise ne se résout ni ne rejette
  // jamais, ce qui bloque l'UI indéfiniment sur "Préparation de l'écoute".
  return new Promise((resolve, reject) => {
    audioContext.decodeAudioData(arrayBuffer, resolve, reject)
  })
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

export async function playBuffer(audioBuffer, audioContext) {
  // iOS/Android peuvent laisser le contexte "suspended" même après un premier
  // resume() plus tôt dans le flow : on le revérifie juste avant de jouer.
  if (audioContext.state !== 'running') {
    await audioContext.resume()
  }
  return new Promise((resolve, reject) => {
    try {
      const source = audioContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioContext.destination)
      source.onended = () => resolve()
      source.start()
    } catch (err) {
      reject(err)
    }
  })
}
