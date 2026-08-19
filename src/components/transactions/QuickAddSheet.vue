<script setup lang="ts">
import { useQuickAddStore } from '@/stores/quickAddStore'
import { useToastStore } from '@/stores/toastStore'
import { useAuth } from '@/composables/useAuth'
import { useTransactions } from '@/composables/useTransactions'
import BottomSheet from '@/components/ui/BottomSheet.vue'
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
  <BottomSheet :open="quickAdd.open" title="Add transaction" @close="quickAdd.hide()">
    <TransactionForm v-if="workspaceId" mode="create" :workspace-id="workspaceId" :on-submit="handleSubmit" @success="quickAdd.hide()" />
  </BottomSheet>
</template>
