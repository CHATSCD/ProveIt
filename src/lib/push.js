import { supabase } from './supabase'

// Public VAPID key — safe to expose client-side (only the private key,
// which lives server-side in the send-push edge function, must stay secret).
const VAPID_PUBLIC_KEY = 'BOPKxFqOrc7l7_eDJrAkTgQabq6ChW-lbfkXwKCJqomqklzKQK3LvID7S8iFRnJEMrIfQZXYRWPUGgjzm3gq_ts'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window
}

export function pushPermission() {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission // 'default' | 'granted' | 'denied'
}

export async function isPushSubscribed() {
  if (!pushSupported()) return false
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return false
  const sub = await reg.pushManager.getSubscription()
  return !!sub
}

export async function subscribeToPush(employeeId) {
  if (!pushSupported()) throw new Error('Push notifications are not supported on this device/browser.')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notification permission denied.')

  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }

  const json = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      employee_id: employeeId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
    { onConflict: 'employee_id,endpoint' }
  )
  if (error) throw error

  return sub
}

// Fire-and-forget push send, used for in-app-triggered notifications
// (submission ready to rate, rating received). Never throws — a failed
// notification should never block the action that triggered it.
export async function notifyPush(payload) {
  try {
    await supabase.functions.invoke('send-push', { body: payload })
  } catch {
    // best-effort only
  }
}

export async function unsubscribeFromPush(employeeId) {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return

  const endpoint = sub.endpoint
  await sub.unsubscribe()
  await supabase.from('push_subscriptions').delete().eq('employee_id', employeeId).eq('endpoint', endpoint)
}
