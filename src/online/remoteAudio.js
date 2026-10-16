import { downloadAudio } from './api'
import { decodeToBuffer, reverseBuffer, withTimeout } from '../lib/audioReverse'

// Cache des sons téléchargés : la clé inclut une "version" (date de création)
// pour qu'une tentative réenregistrée soit retéléchargée.
const blobs = new Map()
const buffers = new Map()

function memo(map, key, factory) {
  if (!map.has(key)) {
    const promise = factory().catch((err) => {
      map.delete(key)
      throw err
    })
    map.set(key, promise)
  }
  return map.get(key)
}

export function getRemoteBlob(path, version = '') {
  return memo(blobs, `${path}@${version}`, () => downloadAudio(path))
}

export function getRemoteBuffer(path, version, ctx, { reversed = false } = {}) {
  const key = `${path}@${version}`
  const forward = memo(buffers, key, async () =>
    withTimeout(
      decodeToBuffer(await getRemoteBlob(path, version), ctx),
      10000,
      'La lecture du son a pris trop de temps'
    )
  )
  if (!reversed) return forward
  return memo(buffers, `${key}:reversed`, async () => reverseBuffer(await forward, ctx))
}
