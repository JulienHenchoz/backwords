// Envoie les notifications push d'une room.
//
// Appelée par le client juste après une action (nouveau mot, mot trouvé,
// arrivée dans une room). La fonction vérifie que l'appelant est bien
// l'auteur de l'action et marque l'événement comme notifié, pour qu'il ne
// puisse pas être rejoué.
//
// Variables d'environnement (secrets) :
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ex. mailto:toi@exemple.ch)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (fournies par Supabase)

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { corsHeaders, json } from '../_shared/cors.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

type Payload = { title: string; body: string; url: string; tag: string }

async function memberName(roomId: string, userId: string) {
  const { data } = await supabase
    .from('room_members')
    .select('name')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle()
  return data?.name ?? 'Quelqu’un'
}

async function roomCode(roomId: string) {
  const { data } = await supabase.from('rooms').select('code').eq('id', roomId).single()
  return data?.code as string
}

// Membres de la room (hors exclus) ayant laissé les notifications activées.
async function recipients(roomId: string, { only, exclude }: { only?: string; exclude?: string }) {
  let query = supabase
    .from('room_members')
    .select('user_id')
    .eq('room_id', roomId)
    .eq('notifications', true)
  if (only) query = query.eq('user_id', only)
  if (exclude) query = query.neq('user_id', exclude)
  const { data } = await query
  return (data ?? []).map((row) => row.user_id as string)
}

async function send(userIds: string[], payload: Payload) {
  if (userIds.length === 0) return 0
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', userIds)

  let sent = 0
  await Promise.all(
    (subscriptions ?? []).map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24 },
        )
        sent++
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        // Abonnement expiré ou révoqué : on le supprime.
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        } else {
          console.error('push failed', status, err)
        }
      }
    }),
  )
  return sent
}

async function notifyNewWord(userId: string, wordId: string) {
  const { data: word } = await supabase
    .from('words')
    .update({ notified: true })
    .eq('id', wordId)
    .eq('author_id', userId)
    .eq('notified', false)
    .select('id, room_id')
    .maybeSingle()
  if (!word) return 0

  const [name, code] = await Promise.all([memberName(word.room_id, userId), roomCode(word.room_id)])
  return send(await recipients(word.room_id, { exclude: userId }), {
    title: `Nouveau mot dans la room ${code}`,
    body: `${name} a enregistré un mot à l’envers. À toi de le deviner !`,
    url: `/#/online/${code}/word/${word.id}`,
    tag: `word-${word.id}`,
  })
}

async function notifyWordSolved(userId: string, wordId: string) {
  const { data: result } = await supabase
    .from('word_results')
    .update({ notified: true })
    .eq('word_id', wordId)
    .eq('user_id', userId)
    .eq('status', 'solved')
    .eq('notified', false)
    .select('room_id, guesses')
    .maybeSingle()
  if (!result) return 0

  const [{ data: word }, { data: secret }] = await Promise.all([
    supabase.from('words').select('author_id').eq('id', wordId).single(),
    supabase.from('word_secrets').select('answer').eq('word_id', wordId).single(),
  ])
  if (!word || word.author_id === userId) return 0

  const [name, code] = await Promise.all([memberName(result.room_id, userId), roomCode(result.room_id)])
  const tries = result.guesses > 1 ? ` en ${result.guesses} essais` : ' du premier coup'
  return send(await recipients(result.room_id, { only: word.author_id }), {
    title: `${name} a trouvé ton mot !`,
    body: `« ${secret?.answer ?? '…'} » deviné${tries}.`,
    url: `/#/online/${code}/word/${wordId}`,
    tag: `solved-${wordId}-${userId}`,
  })
}

async function notifyMemberJoined(userId: string, roomId: string) {
  const { data: member } = await supabase
    .from('room_members')
    .update({ join_notified: true })
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .eq('join_notified', false)
    .select('name')
    .maybeSingle()
  if (!member) return 0

  const code = await roomCode(roomId)
  return send(await recipients(roomId, { exclude: userId }), {
    title: `Nouveau joueur dans la room ${code}`,
    body: `${member.name} a rejoint la partie.`,
    url: `/#/online/${code}`,
    tag: `join-${roomId}-${userId}`,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Unauthorized' }, 401)
  const { data: auth, error: authError } = await supabase.auth.getUser(token)
  if (authError || !auth.user) return json({ error: 'Unauthorized' }, 401)
  const userId = auth.user.id

  let body: { type?: string; word_id?: string; room_id?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  try {
    let sent = 0
    if (body.type === 'new_word' && body.word_id) sent = await notifyNewWord(userId, body.word_id)
    else if (body.type === 'word_solved' && body.word_id) sent = await notifyWordSolved(userId, body.word_id)
    else if (body.type === 'member_joined' && body.room_id) sent = await notifyMemberJoined(userId, body.room_id)
    else return json({ error: 'Unknown notification' }, 400)
    return json({ sent })
  } catch (err) {
    console.error(err)
    return json({ error: 'Internal error' }, 500)
  }
})
