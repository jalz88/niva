// Web Push helpers. The VAPID *public* key is meant to be public (browsers
// send it to the push service); the private half lives only in the send-push
// Edge Function's secrets.
export const VAPID_PUBLIC_KEY =
  'BMHtzhX1PR5WTV6FjEnOVyzEt3ofx1qg2nYdzH_JCeYWaWzTY7zt16arNE34jSIMzugnwvpdPom5RetS4B1AS1c'

export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}
