// Ménage quotidien (déclenché par pg_cron, voir supabase/cron.sql) :
//   1. supprime les fichiers audio des mots publiés il y a plus de 7 jours ;
//   2. supprime les rooms sans nouveau mot depuis 30 jours.
//
// Protégée par le secret CRON_SECRET, envoyé dans l'en-tête `x-cron-secret`.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { json } from '../_shared/cors.ts'

const AUDIO_RETENTION_DAYS = 7
const ROOM_INACTIVITY_DAYS = 30
const BUCKET = 'audio'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

async function removeFiles(paths: string[]) {
  for (let i = 0; i < paths.length; i += 500) {
    const { error } = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 500))
    if (error) throw error
  }
}

async function wordPaths(words: { id: string; room_id: string }[]) {
  if (words.length === 0) return []
  const { data: attempts, error } = await supabase
    .from('attempts')
    .select('audio_path')
    .in('word_id', words.map((w) => w.id))
  if (error) throw error
  return [
    ...words.flatMap((w) => [`${w.room_id}/${w.id}/reversed.wav`, `${w.room_id}/${w.id}/original.wav`]),
    ...(attempts ?? []).map((a) => a.audio_path as string),
  ]
}

async function purgeExpiredAudio() {
  let purged = 0
  // Par lots, pour rester dans les limites de taille des requêtes.
  for (;;) {
    const { data: words, error } = await supabase
      .from('words')
      .select('id, room_id')
      .is('audio_deleted_at', null)
      .lt('created_at', daysAgo(AUDIO_RETENTION_DAYS))
      .limit(200)
    if (error) throw error
    if (!words || words.length === 0) return purged

    await removeFiles(await wordPaths(words))
    const { error: updateError } = await supabase
      .from('words')
      .update({ audio_deleted_at: new Date().toISOString() })
      .in('id', words.map((w) => w.id))
    if (updateError) throw updateError
    purged += words.length
  }
}

async function purgeInactiveRooms() {
  const { data: rooms, error } = await supabase
    .from('rooms')
    .select('id')
    .lt('last_activity_at', daysAgo(ROOM_INACTIVITY_DAYS))
  if (error) throw error
  if (!rooms || rooms.length === 0) return 0

  const roomIds = rooms.map((r) => r.id)
  // Normalement déjà purgés (mots > 7 jours), mais on assure le coup.
  const { data: words } = await supabase
    .from('words')
    .select('id, room_id')
    .in('room_id', roomIds)
    .is('audio_deleted_at', null)
  await removeFiles(await wordPaths(words ?? []))

  const { error: deleteError } = await supabase.from('rooms').delete().in('id', roomIds)
  if (deleteError) throw deleteError
  return roomIds.length
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return json({ error: 'Unauthorized' }, 401)
  }

  try {
    const words = await purgeExpiredAudio()
    const rooms = await purgeInactiveRooms()
    console.log(`cleanup: ${words} mots purgés, ${rooms} rooms supprimées`)
    return json({ words, rooms })
  } catch (err) {
    console.error(err)
    return json({ error: String((err as Error).message ?? err) }, 500)
  }
})
