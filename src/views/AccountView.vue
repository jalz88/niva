<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useToastStore } from '@/stores/toastStore'
import type { NivaError } from '@/lib/errors'
import { usePushNotifications } from '@/composables/usePushNotifications'

const router = useRouter()
const { user, role, displayName, updateDisplayName, signOut } = useAuth()
const toast = useToastStore()

// Build-time constant from package.json's version — see vite.config.ts.
const appVersion = __APP_VERSION__

const nameInput = ref('')
const saving = ref(false)
const saveError = ref<NivaError | null>(null)
const signingOut = ref(false)

const push = usePushNotifications()
const canSeePayments = computed(() => role.value === 'administrator' || role.value === 'manager')
onMounted(() => void push.refresh())

async function onTogglePush() {
  if (push.subscribed.value) {
    if (await push.disable()) toast.show('Notifications turned off on this device', { tone: 'success' })
  } else if (await push.enable()) {
    toast.show('Notifications turned on', { tone: 'success' })
  }
}

watch(
  displayName,
  (name) => {
    nameInput.value = name ?? ''
  },
  { immediate: true },
)

async function onSave() {
  saving.value = true
  saveError.value = null
  const result = await updateDisplayName(nameInput.value)
  saving.value = false
  if (result) {
    saveError.value = result
    return
  }
  toast.show('Name saved', { tone: 'success' })
}

async function onSignOut() {
  signingOut.value = true
  await signOut()
  router.push({ name: 'sign-in' })
}
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 pt-6 pb-24 md:pb-8">
    <h1 class="mb-4 text-h1 font-semibold text-neutral-900">Account</h1>

    <div class="mb-6 rounded-md border border-neutral-200 bg-white p-5 shadow-sm">
      <div class="mb-4">
        <label class="mb-1 block text-body-sm text-neutral-700" for="account-name">Your name</label>
        <div class="flex gap-2">
          <input
            id="account-name"
            v-model="nameInput"
            type="text"
            placeholder="e.g. Jalie"
            class="flex-1 rounded-sm border border-neutral-200 bg-white p-2.5 text-body focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
            @keyup.enter="onSave"
          />
          <button
            type="button"
            :disabled="saving"
            class="rounded-sm bg-accent-500 px-4 text-body font-semibold text-white hover:bg-accent-600 disabled:cursor-not-allowed disabled:bg-neutral-300"
            @click="onSave"
          >
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
        <p v-if="saveError" class="mt-2 text-body-sm text-negative-600" role="alert">{{ saveError.message }}</p>
        <p class="mt-1 text-caption text-neutral-500">Shown wherever you're identified in NIVA, such as who created or last edited a transaction.</p>
      </div>

      <div class="border-t border-neutral-200 pt-4 text-body-sm">
        <div class="flex justify-between py-1">
          <span class="text-neutral-500">Email</span>
          <span class="text-neutral-900">{{ user?.email }}</span>
        </div>
        <div class="flex justify-between py-1">
          <span class="text-neutral-500">Role</span>
          <span class="capitalize text-neutral-900">{{ role }}</span>
        </div>
      </div>
    </div>

    <div class="mb-6 rounded-md border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 class="mb-1 text-body font-semibold text-neutral-900">Notifications</h2>
      <p class="mb-3 text-caption text-neutral-500">A short morning reminder (about 8:00 Sri Lanka time) on this device.</p>

      <p v-if="!push.supported" class="text-body-sm text-neutral-700">This browser doesn't support notifications.</p>
      <p v-else-if="push.needsInstall.value" class="text-body-sm text-neutral-700">
        On iPhone/iPad, notifications only work once NIVA is added to your Home Screen: tap Share, then "Add to Home Screen", and open NIVA from there.
      </p>
      <template v-else>
        <p v-if="push.permission.value === 'denied'" class="mb-3 text-body-sm text-negative-600">
          Notifications are blocked for NIVA in this browser's settings. Allow them there, then come back.
        </p>
        <button
          type="button"
          :disabled="push.busy.value || push.permission.value === 'denied'"
          class="w-full rounded-sm px-4 py-2.5 text-body-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          :class="push.subscribed.value ? 'border border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-100' : 'bg-accent-500 text-white hover:bg-accent-600'"
          @click="onTogglePush"
        >
          {{ push.busy.value ? 'Working…' : push.subscribed.value ? 'Turn off on this device' : 'Turn on notifications' }}
        </button>
        <p v-if="push.error.value" class="mt-2 text-body-sm text-negative-600" role="alert">{{ push.error.value.message }}</p>

        <div v-if="push.subscribed.value" class="mt-4 border-t border-neutral-200 pt-3 text-body-sm">
          <label class="flex items-center justify-between py-1.5">
            <span class="text-neutral-900">Housekeeping reminders</span>
            <input
              type="checkbox"
              class="h-5 w-5 accent-[var(--color-accent-500)]"
              :checked="push.housekeepingEnabled.value"
              @change="push.savePrefs({ housekeeping: ($event.target as HTMLInputElement).checked })"
            />
          </label>
          <label v-if="canSeePayments" class="flex items-center justify-between py-1.5">
            <span class="text-neutral-900">Payments due or overdue</span>
            <input
              type="checkbox"
              class="h-5 w-5 accent-[var(--color-accent-500)]"
              :checked="push.paymentsEnabled.value"
              @change="push.savePrefs({ payments: ($event.target as HTMLInputElement).checked })"
            />
          </label>
        </div>
      </template>
    </div>

    <button
      type="button"
      :disabled="signingOut"
      class="w-full rounded-sm border border-neutral-200 bg-white py-2.5 text-body-sm font-semibold text-neutral-900 hover:bg-neutral-100 disabled:opacity-60"
      @click="onSignOut"
    >
      {{ signingOut ? 'Signing out…' : 'Sign out' }}
    </button>

    <p class="mt-4 text-center text-caption text-neutral-400">NIVA v{{ appVersion }}</p>
  </div>
</template>
