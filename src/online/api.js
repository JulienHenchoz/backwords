import { supabase } from './supabase'
import { audioBufferToCompactWavBlob } from '../lib/wavExport'

export const AUDIO_RETENTION_DAYS = 7
export const CHAT_HISTORY = 50
export const CHAT_MAX_LENGTH = 500
const BUCKET = 'audio'
const PSEUDO_KEY = 'backwords.online.pseudo'

export function loadPseudo() {
  try {
    return localStorage.getItem(PSEUDO_KEY) ?? ''
  } catch {
    return ''
  }
}

export function savePseudo(pseudo) {
  try {
    localStorage.setItem(PSEUDO_KEY, pseudo)
  } catch {
    // Stockage indisponible (navigation privée) : pas grave.
  }
}

function check({ data, error }) {
  if (error) throw new Error(error.message || 'Erreur réseau')
  return data
}

export async function ensureSession() {
  const { data } = await supabase.auth.getSession()
  if (data.session) return data.session.user
  return check(await supabase.auth.signInAnonymously()).user
}

// Fire-and-forget : une notification ratée ne doit pas bloquer le jeu.
function notify(body) {
  supabase.functions.invoke('notify', { body }).catch(() => {})
}

// --- Rooms ------------------------------------------------------------------

export async function createRoom(name, roomName) {
  return check(await supabase.rpc('create_room', { p_name: name, p_room_name: roomName || null }))
}

export async function renameRoom(roomId, roomName) {
  return check(await supabase.rpc('rename_room', { p_room_id: roomId, p_room_name: roomName || null }))
}

export async function joinRoom(code, name) {
  const { room, joined } = check(await supabase.rpc('join_room', { p_code: code, p_name: name }))
  if (joined) notify({ type: 'member_joined', room_id: room.id })
  return room
}

export async function leaveRoom(roomId, userId) {
  check(await supabase.from('room_members').delete().eq('room_id', roomId).eq('user_id', userId))
}

export async function listMyRooms(userId) {
  const rows = check(
    await supabase
      .from('room_members')
      .select('name, rooms(id, code, name, last_activity_at)')
      .eq('user_id', userId)
  )
  return rows
    .filter((row) => row.rooms)
    .map((row) => ({ ...row.rooms, myPseudo: row.name }))
    .sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at))
}

export async function getRoomByCode(code) {
  return check(await supabase.from('rooms').select('*').eq('code', code).maybeSingle())
}

export async function fetchRoomData(roomId) {
  const [members, words, results, attempts, messages] = await Promise.all([
    supabase.from('room_members').select('*').eq('room_id', roomId).order('joined_at'),
    supabase.from('words').select('*').eq('room_id', roomId).order('created_at', { ascending: false }),
    supabase.from('word_results').select('*').eq('room_id', roomId),
    supabase.from('attempts').select('*').eq('room_id', roomId).order('created_at'),
    supabase
      .from('room_messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(CHAT_HISTORY),
  ])
  return {
    members: check(members),
    words: check(words),
    results: check(results),
    attempts: check(attempts),
    // Les plus récents sont chargés, affichés du plus ancien au plus récent.
    messages: check(messages).reverse(),
  }
}

export async function sendMessage(roomId, userId, body) {
  check(await supabase.from('room_messages').insert({ room_id: roomId, user_id: userId, body }))
}

export async function setRoomNotifications(roomId, enabled) {
  check(await supabase.rpc('set_room_notifications', { p_room_id: roomId, p_enabled: enabled }))
}

// --- Mots -------------------------------------------------------------------

export function wordAudioPath(word, kind) {
  return `${word.room_id}/${word.id}/${kind}.wav`
}

async function upload(path, buffer, { upsert = false } = {}) {
  const blob = await audioBufferToCompactWavBlob(buffer)
  check(await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'audio/wav', upsert }))
}

export async function createWord({ roomId, answer, buffer, reversedBuffer }) {
  const word = { id: crypto.randomUUID(), room_id: roomId }
  await Promise.all([
    upload(wordAudioPath(word, 'reversed'), reversedBuffer),
    upload(wordAudioPath(word, 'original'), buffer),
  ])
  const created = check(
    await supabase.rpc('create_word', { p_word_id: word.id, p_room_id: roomId, p_answer: answer })
  )
  notify({ type: 'new_word', word_id: created.id })
  return created
}

export async function submitGuess(wordId, guess) {
  const result = check(await supabase.rpc('submit_guess', { p_word_id: wordId, p_guess: guess }))
  if (result.correct) notify({ type: 'word_solved', word_id: wordId })
  return result
}

export async function giveUp(wordId) {
  return check(await supabase.rpc('give_up', { p_word_id: wordId }))
}

export async function getAnswer(wordId) {
  return check(await supabase.rpc('get_answer', { p_word_id: wordId }))
}

export async function shareAttempt({ word, userId, buffer }) {
  const path = `${word.room_id}/${word.id}/attempts/${userId}.wav`
  await upload(path, buffer, { upsert: true })
  check(
    await supabase.from('attempts').upsert(
      {
        word_id: word.id,
        user_id: userId,
        room_id: word.room_id,
        audio_path: path,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'word_id,user_id' }
    )
  )
}

export async function downloadAudio(path) {
  return check(await supabase.storage.from(BUCKET).download(path))
}

export function audioExpiresAt(word) {
  return new Date(new Date(word.created_at).getTime() + AUDIO_RETENTION_DAYS * 24 * 60 * 60 * 1000)
}

export function isAudioAvailable(word) {
  return !word.audio_deleted_at && audioExpiresAt(word) > new Date()
}
