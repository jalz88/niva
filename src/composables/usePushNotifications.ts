import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { toNivaError, type NivaError } from '@/lib/errors'
import { useAuth } from '@/composables/useAuth'
import { VAPID_PUBLIC_KEY, urlBase64ToUint8Array, isPushSupported, isIos, isStandalone } from '@/lib/push'

export function usePushNotifications() {
  const { user, workspaceId } = useAuth()

  const supported = isPushSupported()
  // iOS only allows web push for a PWA added to the home screen (16.4+).
  const needsInstall = computed(() => isIos() && !isStandalone())
  const permission = ref<NotificationPermission>(supported ? Notification.permission : 'denied')
  const subscribed = ref(false)
  const paymentsEnabled = ref(true)
  const housekeepingEnabled = ref(true)
  const busy = ref(false)
  const error = ref<NivaError | null>(null)

  async function currentSubscription(): Promise<PushSubscription | null> {
    if (!supported) return null
    const reg = await navigator.serviceWorker.ready
    return reg.pushManager.getSubscription()
  }

  async function refresh() {
    if (!supported || !user.value) return
    permission.value = Notification.permission
    const sub = await currentSubscription()
    if (sub) {
      // Only "subscribed" if the server still has this endpoint for *me*
      // (another person may have taken over this device since).
      const { data } = await supabase.from('push_subscriptions').select('id').eq('endpoint', sub.endpoint).maybeSingle()
      subscribed.value = !!data
    } else {
      subscribed.value = false
    }
    const { data: prefs } = await supabase
      .from('push_preferences')
      .select('payments_enabled, housekeeping_enabled')
      .eq('user_id', user.value.id)
      .maybeSingle()
    paymentsEnabled.value = prefs?.payments_enabled ?? true
    housekeepingEnabled.value = prefs?.housekeeping_enabled ?? true
  }

  async function enable(): Promise<boolean> {
    if (!supported || !workspaceId.value) return false
    busy.value = true
    error.value = null
    try {
      const result = await Notification.requestPermission()
      permission.value = result
      if (result !== 'granted') return false
      const reg = await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }))
      const json = sub.toJSON()
      const { error: rpcError } = await supabase.rpc('register_push_subscription', {
        p_workspace_id: workspaceId.value,
        p_endpoint: sub.endpoint,
        p_p256dh: json.keys?.p256dh ?? '',
        p_auth: json.keys?.auth ?? '',
        p_user_agent: navigator.userAgent,
      })
      if (rpcError) throw rpcError
      subscribed.value = true
      return true
    } catch (e) {
      error.value = toNivaError(e)
      return false
    } finally {
      busy.value = false
    }
  }

  async function disable(): Promise<boolean> {
    busy.value = true
    error.value = null
    try {
      const sub = await currentSubscription()
      if (sub) {
        await supabase.rpc('unregister_push_subscription', { p_endpoint: sub.endpoint })
        await sub.unsubscribe()
      }
      subscribed.value = false
      return true
    } catch (e) {
      error.value = toNivaError(e)
      return false
    } finally {
      busy.value = false
    }
  }

  async function savePrefs(next: { payments?: boolean; housekeeping?: boolean }): Promise<boolean> {
    if (!user.value) return false
    const payments = next.payments ?? paymentsEnabled.value
    const housekeeping = next.housekeeping ?? housekeepingEnabled.value
    error.value = null
    const { error: upsertError } = await supabase.from('push_preferences').upsert({
      user_id: user.value.id,
      payments_enabled: payments,
      housekeeping_enabled: housekeeping,
      updated_at: new Date().toISOString(),
    })
    if (upsertError) {
      error.value = toNivaError(upsertError)
      return false
    }
    paymentsEnabled.value = payments
    housekeepingEnabled.value = housekeeping
    return true
  }

  return { supported, needsInstall, permission, subscribed, paymentsEnabled, housekeepingEnabled, busy, error, refresh, enable, disable, savePrefs }
}
