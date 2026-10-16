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

// Joue un son et se résout à la fin. `onSource` reçoit la source pour pouvoir
// l'arrêter. Filet de sécurité : si le navigateur ne signale jamais la fin
// (contexte audio interrompu), on se résout quand même après la durée du son.
export function playBuffer(audioBuffer, audioContext, { onSource } = {}) {
  return new Promise((resolve, reject) => {
    let done = false
    let safety = null
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(safety)
      resolve()
    }
    try {
      const source = audioContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioContext.destination)
      source.onended = finish
      source.start()
      onSource?.(source)
      safety = setTimeout(() => {
        try {
          source.stop()
        } catch {
          // Déjà arrêtée.
        }
        finish()
      }, audioBuffer.duration * 1000 + 1500)
    } catch (err) {
      reject(err)
    }
  })
}
