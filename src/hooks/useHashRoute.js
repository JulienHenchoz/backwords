import { useEffect, useState } from 'react'

// Routes :
//   (vide)                        partie locale
//   #/online                      accueil en ligne
//   #/online/123456               room
//   #/online/123456/new           proposer un mot
//   #/online/123456/word/<id>     un mot
export function parseRoute(hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] !== 'online') return { name: 'local' }
  const code = parts[1]
  if (!code) return { name: 'online-home' }
  if (parts[2] === 'new') return { name: 'new-word', code }
  if (parts[2] === 'word' && parts[3]) return { name: 'word', code, wordId: parts[3] }
  return { name: 'room', code }
}

export function navigate(path) {
  window.location.hash = path
}

export function useHashRoute() {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))

  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(window.location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}
