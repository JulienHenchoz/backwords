import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

export function isPushConfigured() {
  return Boolean(VAPID_PUBLIC_KEY)
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (char) => char.charCodeAt(0))
}

async function getRegistration() {
  const registration = await navigator.serviceWorker.getRegistration()
  if (registration) return registration
  // Premier chargement : le service worker est peut-être encore en cours
  // d'installation.
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Service worker indisponible')), 8000)
    ),
  ])
}

async function saveSubscription(subscription) {
  const { endpoint, keys } = subscription.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
  })
  if (error) throw new Error(error.message)
}

// 'unsupported' | 'denied' | 'enabled' | 'disabled'
export async function getPushState() {
  if (!isPushSupported() || !isPushConfigured()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted') return 'disabled'
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return 'disabled'
  // Réassocie l'abonnement à l'utilisateur courant (au cas où la session
  // anonyme aurait changé).
  saveSubscription(subscription).catch(() => {})
  return 'enabled'
}

export async function enablePush() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'disabled'
  const registration = await getRegistration()
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }))
  await saveSubscription(subscription)
  return 'enabled'
}

export async function disablePush() {
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (subscription) {
    await supabase.rpc('delete_push_subscription', { p_endpoint: subscription.endpoint })
    await subscription.unsubscribe()
  }
  return 'disabled'
}
