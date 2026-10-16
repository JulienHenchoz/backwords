// Données de l'écran d'admin (/admin).
//
// Protégée par ADMIN_USERNAME / ADMIN_PASSWORD (secrets de la fonction, jamais
// exposés au navigateur), envoyés par le front dans l'en-tête `x-admin-auth`
// sous la forme base64("utilisateur:motdepasse").

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

const encoder = new TextEncoder()

// Comparaison en temps constant (sur des empreintes de même longueur).
async function sameSecret(a: string, b: string) {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ])
  const x = new Uint8Array(ha)
  const y = new Uint8Array(hb)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

async function isAuthorized(req: Request) {
  const username = Deno.env.get('ADMIN_USERNAME')
  const password = Deno.env.get('ADMIN_PASSWORD')
  if (!username || !password) return false

  let given = ''
  try {
    const binary = atob(req.headers.get('x-admin-auth') ?? '')
    given = new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
  } catch {
    return false
  }
  const separator = given.indexOf(':')
  if (separator < 0) return false

  const [okUser, okPassword] = await Promise.all([
    sameSecret(given.slice(0, separator), username),
    sameSecret(given.slice(separator + 1), password),
  ])
  return okUser && okPassword
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  if (!(await isAuthorized(req))) {
    // Freine les tentatives de force brute.
    await new Promise((resolve) => setTimeout(resolve, 1000))
    return json({ error: 'Identifiants incorrects' }, 401)
  }

  const { data, error } = await supabase.rpc('admin_overview')
  if (error) {
    console.error(error)
    return json({ error: 'Internal error' }, 500)
  }
  return json(data)
})
