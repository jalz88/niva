<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ArrowLeft, ArrowDownLeft, ArrowUpRight } from 'lucide-vue-next'
import { useAuth } from '@/composables/useAuth'
import { useTransactions } from '@/composables/useTransactions'
import { useMembers } from '@/composables/useMembers'
import { useCategories } from '@/composables/useCategories'
import { useToastStore } from '@/stores/toastStore'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import type { TransactionWithLabels } from '@/types/database'

const route = useRoute()
const router = useRouter()
const { role, workspaceId } = useAuth()
const { get, archive } = useTransactions()
const members = useMembers()
const categories = useCategories()
const toast = useToastStore()

const transaction = ref<TransactionWithLabels | null>(null)
const loading = ref(true)
const notFound = ref(false)
const showDeleteConfirm = ref(false)
const deleting = ref(false)

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
}

watch(() => route.params.id, load, { immediate: true })
watch(
  workspaceId,
  (id) => {
    if (!id) return
    members.list(id)
    categories.list(id)
  },
  { immediate: true },
)

// A transaction's category_id may point at a sub-category directly (see
// migration 0005) — show it with its parent for context, e.g.
// "Repairs & maintenance · Plumbing", not just "Plumbing" in isolation.
const categoryDisplay = computed(() => {
  if (!transaction.value) return ''
  const cat = categories.items.value.find((c) => c.id === transaction.value!.category_id)
  const parent = cat?.parent_category_id ? categories.items.value.find((c) => c.id === cat.parent_category_id) : null
  return parent ? `${parent.name} · ${transaction.value.category_name}` : transaction.value.category_name
})

// Corrections are a manager/administrator action — staff and viewer see
// neither control, per docs/05-information-architecture.md's permissions
// table (decided 2026-07-19).
const canEdit = computed(() => role.value === 'administrator' || role.value === 'manager')
const canSeeAudit = computed(() => role.value === 'administrator' || role.value === 'manager')

function memberLabel(userId: string) {
  const m = members.members.value.find((m) => m.userId === userId)
  return m?.displayName || m?.email || 'Unknown user'
}

function formatAmount(tx: TransactionWithLabels) {
  const sign = tx.type === 'income' ? '+' : '−'
  return `${sign} ${tx.currency_code} ${Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

async function confirmDelete() {
  if (!transaction.value) return
  deleting.value = true
  const { error } = await archive(transaction.value.id)
  deleting.value = false
  showDeleteConfirm.value = false
  if (error) {
    toast.show(error.message, { tone: 'error' })
    return
  }

  const archivedId = transaction.value.id
  toast.show('Transaction deleted', {
    tone: 'success',
    actionLabel: 'Undo',
    onAction: async () => {
      const { unarchive } = useTransactions()
      const { error: undoError } = await unarchive(archivedId)
      if (undoError) toast.show(undoError.message, { tone: 'error' })
      else toast.show('Transaction restored', { tone: 'success' })
    },
  })
  router.push({ name: 'transactions' })
}
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 pt-6 pb-24 md:pb-8">
    <RouterLink :to="{ name: 'transactions' }" class="mb-4 flex items-center gap-1.5 text-body-sm font-medium text-neutral-600 hover:text-neutral-900">
      <ArrowLeft :size="16" />
      Transactions
    </RouterLink>

    <div v-if="loading" class="h-40 animate-pulse rounded-md bg-neutral-100" />

    <section v-else-if="notFound" class="rounded-md border border-neutral-200 bg-white p-6 text-center shadow-sm">
      <h1 class="mb-1 text-h3 font-semibold text-neutral-900">Transaction not found</h1>
      <p class="text-body-sm text-neutral-500">It may have been deleted, or you may not have access to it.</p>
    </section>

    <template v-else-if="transaction">
      <div class="mb-5 rounded-md border border-neutral-200 bg-white p-5 shadow-sm">
        <div class="mb-4 flex items-center gap-3">
          <span
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            :class="transaction.type === 'income' ? 'bg-positive-600/10 text-positive-600' : 'bg-negative-600/10 text-negative-600'"
          >
            <ArrowUpRight v-if="transaction.type === 'income'" :size="20" />
            <ArrowDownLeft v-else :size="20" />
          </span>
          <div>
            <p class="text-amount font-semibold" :class="transaction.type === 'income' ? 'text-positive-600' : 'text-negative-600'">
              {{ formatAmount(transaction) }}
            </p>
            <p class="text-caption text-neutral-500">{{ transaction.type === 'income' ? 'Income' : 'Expense' }}</p>
          </div>
        </div>

        <dl class="grid grid-cols-2 gap-y-3 text-body-sm">
          <dt class="text-neutral-500">Date</dt>
          <dd class="text-neutral-900">{{ dayjs(transaction.occurred_on).format('D MMMM YYYY') }}</dd>

          <dt class="text-neutral-500">Property</dt>
          <dd class="text-neutral-900">{{ transaction.property_name }}</dd>

          <dt class="text-neutral-500">Category</dt>
          <dd class="text-neutral-900">{{ categoryDisplay }}</dd>

          <dt class="text-neutral-500">Payment method</dt>
          <dd class="text-neutral-900">{{ transaction.payment_method_name }}</dd>

          <template v-if="transaction.type === 'income'">
            <dt class="text-neutral-500">Platform</dt>
            <dd class="text-neutral-900">{{ transaction.platform_name || '—' }}</dd>
          </template>
          <template v-else>
            <dt class="text-neutral-500">Supplier</dt>
            <dd class="text-neutral-900">{{ transaction.supplier_name || '—' }}</dd>
          </template>

          <template v-if="transaction.notes">
            <dt class="text-neutral-500">Notes</dt>
            <dd class="text-neutral-900">{{ transaction.notes }}</dd>
          </template>
        </dl>
      </div>

      <div v-if="canSeeAudit" class="mb-5 rounded-md border border-neutral-200 bg-neutral-50 p-4 text-caption text-neutral-500">
        <p>Created by {{ memberLabel(transaction.created_by) }} on {{ dayjs(transaction.created_at).format('D MMM YYYY, h:mm A') }}</p>
        <p v-if="transaction.updated_by">
          Last edited by {{ memberLabel(transaction.updated_by) }} on {{ dayjs(transaction.updated_at).format('D MMM YYYY, h:mm A') }}
        </p>
      </div>

      <div v-if="canEdit" class="flex gap-2">
        <RouterLink
          :to="{ name: 'transaction-edit', params: { id: transaction.id } }"
          class="flex-1 rounded-sm border border-neutral-200 bg-white py-2.5 text-center text-body-sm font-semibold text-neutral-900 hover:bg-neutral-100"
        >
          Edit
        </RouterLink>
        <button
          type="button"
          class="flex-1 rounded-sm border border-negative-600/30 py-2.5 text-body-sm font-semibold text-negative-600 hover:bg-negative-600/5"
          @click="showDeleteConfirm = true"
        >
          Delete
        </button>
      </div>
    </template>

    <ConfirmDialog
      :open="showDeleteConfirm"
      title="Delete this transaction?"
      :description="
        transaction
          ? `This moves the ${transaction.currency_code} ${Number(transaction.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${transaction.category_name} ${transaction.type} from ${dayjs(transaction.occurred_on).format('D MMM')} out of your reports. An administrator can restore it from Administration → Archived.`
          : ''
      "
      confirm-label="Delete transaction"
      danger
      :busy="deleting"
      @confirm="confirmDelete"
      @cancel="showDeleteConfirm = false"
    />
  </div>
</template>
