<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { useQuickAddStore } from '@/stores/quickAddStore'
import { useToastStore } from '@/stores/toastStore'
import { useAuth } from '@/composables/useAuth'
import { useTransactions } from '@/composables/useTransactions'
import TransactionForm from './TransactionForm.vue'
import type { TransactionPayload } from '@/lib/schemas/transaction'
import type { NivaError } from '@/lib/errors'

const quickAdd = useQuickAddStore()
const toast = useToastStore()
const { workspaceId } = useAuth()
const { create } = useTransactions()

async function handleSubmit(payload: TransactionPayload): Promise<NivaError | null> {
  if (!workspaceId.value) return { code: 'unknown_error', message: 'No workspace found for this account.', retryable: false }

  const { error } = await create(workspaceId.value, payload)
  if (error) return error

  toast.show(payload.type === 'income' ? 'Income added' : 'Expense added', { tone: 'success' })
  return null
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="quickAdd.open"
        class="fixed inset-0 z-40 bg-neutral-900/40"
        @click.self="quickAdd.hide()"
      >
        <Transition name="slide-up">
          <div
            v-if="quickAdd.open"
            class="fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-lg bg-white shadow-lg md:inset-x-auto md:bottom-8 md:left-1/2 md:w-full md:max-w-md md:-translate-x-1/2 md:rounded-md"
          >
            <div class="sticky top-0 flex items-center justify-between border-b border-neutral-200 bg-white p-4">
              <h2 class="text-h3 font-semibold text-neutral-900">Add transaction</h2>
              <button
                type="button"
                aria-label="Close"
                class="rounded-sm p-1 text-neutral-500 hover:bg-neutral-100"
                @click="quickAdd.hide()"
              >
                <X :size="20" />
              </button>
            </div>
            <div class="p-4">
              <TransactionForm
                v-if="workspaceId"
                mode="create"
                :workspace-id="workspaceId"
                :on-submit="handleSubmit"
                @success="quickAdd.hide()"
              />
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.2s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}
</style>
