import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../online/supabase'

const STORAGE_KEY = 'backwords.admin.auth'

export function encodeCredentials(username, password) {
  const bytes = new TextEncoder().encode(`${username}:${password}`)
  return btoa(String.fromCharCode(...bytes))
}

// Gardés le temps de l'onglet uniquement.
export function loadCredentials() {
  try {
    return sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function saveCredentials(auth) {
  try {
    if (auth) sessionStorage.setItem(STORAGE_KEY, auth)
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Stockage indisponible : il faudra se reconnecter au rechargement.
  }
}

export class UnauthorizedError extends Error {}

export async function fetchOverview(auth) {
  const { data, error } = await supabase.functions.invoke('admin', {
    body: {},
    headers: { 'x-admin-auth': auth },
  })
  if (error) {
    if (error instanceof FunctionsHttpError && error.context?.status === 401) {
      throw new UnauthorizedError('Identifiants incorrects')
    }
    throw new Error(error.message || 'Impossible de charger les données')
  }
  return data
}
