<script setup lang="ts">
import { ref } from 'vue'
import { useQuickAddStore } from '@/stores/quickAddStore'
import { useToastStore } from '@/stores/toastStore'
import { useAuth } from '@/composables/useAuth'
import { useTransactions } from '@/composables/useTransactions'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import TransactionForm from './TransactionForm.vue'
import type { TransactionPayload } from '@/lib/schemas/transaction'
import type { NivaError } from '@/lib/errors'

const quickAdd = useQuickAddStore()
const toast = useToastStore()
const { workspaceId } = useAuth()
const { create } = useTransactions()

const formRef = ref<InstanceType<typeof TransactionForm> | null>(null)
// See BottomSheet.vue's `dirty`/`close-blocked` note — tapping the backdrop
// or the X used to silently drop whatever was typed. showDiscardConfirm
// gates a real confirm instead.
const showDiscardConfirm = ref(false)

function handleCloseBlocked() {
  showDiscardConfirm.value = true
}
function discardAndClose() {
  showDiscardConfirm.value = false
  quickAdd.hide()
}

async function handleSubmit(payload: TransactionPayload): Promise<NivaError | null> {
  if (!workspaceId.value) return { code: 'unknown_error', message: 'No workspace found for this account.', retryable: false }

  const { error } = await create(workspaceId.value, payload)
  if (error) return error

  toast.show(payload.type === 'income' ? 'Income added' : 'Expense added', { tone: 'success' })
  return null
}
</script>

<template>
  <BottomSheet
    :open="quickAdd.open"
    title="Add transaction"
    :dirty="formRef?.isDirty ?? false"
    @close="quickAdd.hide()"
    @close-blocked="handleCloseBlocked"
  >
    <TransactionForm v-if="workspaceId" ref="formRef" mode="create" :workspace-id="workspaceId" :on-submit="handleSubmit" @success="quickAdd.hide()" />
  </BottomSheet>
  <ConfirmDialog
    :open="showDiscardConfirm"
    title="Discard this transaction?"
    description="What you've entered hasn't been saved. If you close now, it will be lost."
    confirm-label="Discard"
    danger
    @confirm="discardAndClose"
    @cancel="showDiscardConfirm = false"
  />
</template>
