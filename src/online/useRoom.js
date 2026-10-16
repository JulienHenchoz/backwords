import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'
import { fetchRoomData, getRoomByCode } from './api'

const REALTIME_TABLES = ['room_members', 'words', 'word_results', 'attempts']

// Charge une room (si on en est membre) et la tient à jour en temps réel.
export function useRoom(code) {
  const [state, setState] = useState({ status: 'loading', room: null, error: null })
  const [data, setData] = useState({ members: [], words: [], results: [], attempts: [] })
  const roomId = state.room?.id
  const reloadTimer = useRef(null)

  const loadRoom = useCallback(async () => {
    setState({ status: 'loading', room: null, error: null })
    try {
      const room = await getRoomByCode(code)
      if (!room) {
        setState({ status: 'not-member', room: null, error: null })
        return
      }
      setData(await fetchRoomData(room.id))
      setState({ status: 'ready', room, error: null })
    } catch (error) {
      setState({ status: 'error', room: null, error })
    }
  }, [code])

  const reload = useCallback(async () => {
    if (!roomId) return
    try {
      setData(await fetchRoomData(roomId))
    } catch {
      // Réseau capricieux : le prochain événement retentera.
    }
  }, [roomId])

  // Regroupe les rafales d'événements (ex. mot + résultat) en un seul rechargement.
  const scheduleReload = useCallback(() => {
    clearTimeout(reloadTimer.current)
    reloadTimer.current = setTimeout(reload, 250)
  }, [reload])

  useEffect(() => {
    loadRoom()
  }, [loadRoom])

  useEffect(() => {
    if (!roomId) return
    let channel = supabase.channel(`room-${roomId}`)
    for (const table of REALTIME_TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `room_id=eq.${roomId}` },
        scheduleReload
      )
    }
    channel.subscribe()

    // Les WebSockets sont coupés quand l'app passe en arrière-plan sur mobile.
    const onVisible = () => {
      if (document.visibilityState === 'visible') scheduleReload()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearTimeout(reloadTimer.current)
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(channel)
    }
  }, [roomId, scheduleReload])

  const derived = useMemo(() => {
    const membersById = new Map(data.members.map((m) => [m.user_id, m]))
    const resultsByWord = new Map()
    for (const result of data.results) {
      if (!resultsByWord.has(result.word_id)) resultsByWord.set(result.word_id, [])
      resultsByWord.get(result.word_id).push(result)
    }
    const attemptsByWord = new Map()
    for (const attempt of data.attempts) {
      if (!attemptsByWord.has(attempt.word_id)) attemptsByWord.set(attempt.word_id, [])
      attemptsByWord.get(attempt.word_id).push(attempt)
    }
    return { membersById, resultsByWord, attemptsByWord }
  }, [data])

  return { ...state, ...data, ...derived, reload, loadRoom }
}

export function memberName(membersById, userId) {
  return membersById.get(userId)?.name ?? 'Ancien joueur'
}
