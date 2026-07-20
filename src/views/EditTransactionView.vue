<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import { useAuth } from '@/composables/useAuth'
import { useTransactions } from '@/composables/useTransactions'
import { useToastStore } from '@/stores/toastStore'
import TransactionForm from '@/components/transactions/TransactionForm.vue'
import type { TransactionFormValues, TransactionPayload } from '@/lib/schemas/transaction'
import type { NivaError } from '@/lib/errors'
import type { TransactionWithLabels } from '@/types/database'

const route = useRoute()
const router = useRouter()
const { workspaceId } = useAuth()
const { get, update } = useTransactions()
const toast = useToastStore()

const transaction = ref<TransactionWithLabels | null>(null)
const loading = ref(true)
const notFound = ref(false)
// Bumped on every reload so <TransactionForm> remounts with fresh
// initialValues — resetForm() alone won't pick up new defaults.
const formKey = ref(0)

async function load() {
  loading.value = true
  notFound.value = false
  const id = route.params.id as string
  const { data, error } = await get(id)
  loading.value = false
  if (error || !data) {
    notFound.value = true
    return
  }
  transaction.value = data
  formKey.value += 1
}

watch(() => route.params.id, load, { immediate: true })

const initialValues = computed<Partial<TransactionFormValues> | undefined>(() => {
  if (!transaction.value) return undefined
  const tx = transaction.value
  return {
    type: tx.type,
    amount: tx.amount,
    currencyCode: tx.currency_code,
    occurredOn: tx.occurred_on,
    propertyId: tx.property_id,
    categoryId: tx.category_id,
    paymentMethodId: tx.payment_method_id,
    platformId: tx.platform_id ?? '',
    supplierName: tx.supplier_name ?? '',
    notes: tx.notes ?? '',
  }
})

const headerLabel = computed(() => {
  if (!transaction.value) return 'Editing transaction'
  const amount = `${transaction.value.currency_code} ${Number(transaction.value.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return `Editing ${transaction.value.type} · ${amount}`
})

async function handleSubmit(payload: TransactionPayload): Promise<NivaError | null> {
  if (!transaction.value) return null
  const { error } = await update(transaction.value.id, payload, transaction.value.updated_at)
  if (error) return error

  toast.show('Transaction updated', { tone: 'success' })
  router.push({ name: 'transaction-detail', params: { id: transaction.value.id } })
  return null
}
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 pt-6 pb-24 md:pb-8">
    <RouterLink
      :to="transaction ? { name: 'transaction-detail', params: { id: transaction.id } } : { name: 'transactions' }"
      class="mb-4 flex items-center gap-1.5 text-body-sm font-medium text-neutral-600 hover:text-neutral-900"
    >
      <ArrowLeft :size="16" />
      Back
    </RouterLink>

    <div v-if="loading" class="h-40 animate-pulse rounded-md bg-neutral-100" />

    <section v-else-if="notFound" class="rounded-md border border-neutral-200 bg-white p-6 text-center shadow-sm">
      <h1 class="mb-1 text-h3 font-semibold text-neutral-900">Transaction not found</h1>
      <p class="text-body-sm text-neutral-500">It may have been deleted, or you may not have access to it.</p>
    </section>

    <template v-else-if="transaction && workspaceId">
      <h1 class="mb-4 text-h1 font-semibold text-neutral-900">{{ headerLabel }}</h1>
      <TransactionForm
        :key="formKey"
        mode="edit"
        :workspace-id="workspaceId"
        :initial-values="initialValues"
        :on-submit="handleSubmit"
        @reload-requested="load"
      />
    </template>
  </div>
</template>
