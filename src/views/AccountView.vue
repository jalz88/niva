<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useToastStore } from '@/stores/toastStore'
import type { NivaError } from '@/lib/errors'

const router = useRouter()
const { user, role, displayName, updateDisplayName, signOut } = useAuth()
const toast = useToastStore()

const nameInput = ref('')
const saving = ref(false)
const saveError = ref<NivaError | null>(null)
const signingOut = ref(false)

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

    <button
      type="button"
      :disabled="signingOut"
      class="w-full rounded-sm border border-neutral-200 bg-white py-2.5 text-body-sm font-semibold text-neutral-900 hover:bg-neutral-100 disabled:opacity-60"
      @click="onSignOut"
    >
      {{ signingOut ? 'Signing out…' : 'Sign out' }}
    </button>
  </div>
</template>
