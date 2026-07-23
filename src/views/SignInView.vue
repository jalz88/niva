<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import type { NivaError } from '@/lib/errors'

const email = ref('')
const password = ref('')
const submitting = ref(false)
const error = ref<NivaError | null>(null)

const { signIn } = useAuth()
const router = useRouter()

async function onSubmit() {
  error.value = null
  submitting.value = true
  const result = await signIn(email.value, password.value)
  submitting.value = false

  if (result) {
    error.value = result
    return
  }
  router.push({ name: 'dashboard' })
}
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4">
    <img src="/branding/niva-mark.svg" alt="" width="56" height="56" class="mb-4 rounded-md" />
    <form
      class="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-6 shadow-sm"
      @submit.prevent="onSubmit"
    >
      <h1 class="mb-1 text-h1 font-semibold text-neutral-900">NIVA</h1>
      <p class="mb-6 text-body-sm text-neutral-500">Your property operating system.</p>

      <div
        v-if="error"
        class="mb-4 rounded-sm border border-negative-600/30 bg-negative-600/5 p-3 text-body-sm text-negative-600"
        role="alert"
      >
        {{ error.message }}
      </div>

      <label class="mb-3 block">
        <span class="mb-1 block text-body-sm text-neutral-700">Email</span>
        <input
          v-model="email"
          type="email"
          required
          autocomplete="email"
          class="w-full rounded-sm border border-neutral-200 bg-white p-2.5 text-body focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
        />
      </label>

      <label class="mb-5 block">
        <span class="mb-1 block text-body-sm text-neutral-700">Password</span>
        <input
          v-model="password"
          type="password"
          required
          autocomplete="current-password"
          class="w-full rounded-sm border border-neutral-200 bg-white p-2.5 text-body focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
        />
      </label>

      <button
        type="submit"
        :disabled="submitting"
        class="w-full rounded-sm bg-accent-500 p-3 text-body font-semibold text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500"
      >
        {{ submitting ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>
  </div>
</template>
