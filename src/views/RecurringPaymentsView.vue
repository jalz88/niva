<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { Plus } from 'lucide-vue-next'
import { useAuth } from '@/composables/useAuth'
import { useConfigItems } from '@/composables/useConfigItems'
import { useCategories, topLevelCategories } from '@/composables/useCategories'
import { usePaymentMethods } from '@/composables/usePaymentMethods'
import { useCurrencies } from '@/composables/useCurrencies'
import { useRecurringPayments, type RecurringPaymentPayload } from '@/composables/useRecurringPayments'
import { useToastStore } from '@/stores/toastStore'
import { formatMoney, formatAmountInput, cleanAmountInput } from '@/lib/money'
import { computeNextDueOn, cadenceLabel, dueLabel, WEEKDAY_NAMES } from '@/lib/recurringPayments'
import type { NivaError } from '@/lib/errors'
import type { RecurringPaymentWithLabels } from '@/types/database'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import ChipPicker from '@/components/ui/ChipPicker.vue'
import DetailRow from '@/components/ui/DetailRow.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const { workspaceId } = useAuth()
const properties = useConfigItems('properties')
const categories = useCategories()
const paymentMethods = usePaymentMethods()
const currencies = useCurrencies()
const { items, loading, error, list, create, update, remove, markPaid, revision } = useRecurringPayments()
const toast = useToastStore()

// No property field here either — same silent single-active-property
// assignment as TransactionForm, see docs/12-ux-options-review.md C.9.
const activePropertyId = computed(() => properties.items.value.find((p) => p.is_active)?.id ?? '')
const defaultCurrencyCode = computed(() => currencies.rows.value.find((r) => r.isDefault)?.code ?? '')

watch(
  workspaceId,
  (id) => {
    if (!id) return
    properties.list(id)
    categories.list(id)
    paymentMethods.list(id)
    currencies.list(id)
    list(id)
  },
  { immediate: true },
)

const hasAnyPayments = computed(() => items.value.length > 0)

// Create/update/delete/markPaid all clear the cache and bump revision
// (same contract as useTransactions) but never mutate `items` directly -
// refetch so a newly-added or edited payment shows up without a manual
// reload. Matches TransactionsView.vue's watch(revision, ...) pattern.
watch(revision, () => {
  if (workspaceId.value) list(workspaceId.value)
})

const grouped = computed(() => {
  const overdue: { item: RecurringPaymentWithLabels; due: ReturnType<typeof dueLabel> }[] = []
  const upcoming: { item: RecurringPaymentWithLabels; due: ReturnType<typeof dueLabel> }[] = []
  for (const item of items.value) {
    const due = dueLabel(item.next_due_on)
    ;(due.status === 'overdue' ? overdue : upcoming).push({ item, due })
  }
  return { overdue, upcoming }
})

function subLabel(item: RecurringPaymentWithLabels): string {
  return `${item.category_name} · ${item.payment_method_name} · ${cadenceLabel(item.cadence_type, item.cadence_day_of_month, item.cadence_day_of_week)}`
}

// ---- Add/Edit sheet -------------------------------------------------------

const showForm = ref(false)
const editingId = ref<string | null>(null)
// Original cadence at the moment Edit opened — only recompute next_due_on
// when the cadence actually changes (see submitForm). Editing just the
// amount or category must never silently reschedule the due date.
const editingOriginal = ref<{ cadenceType: 'monthly' | 'weekly'; dayOfMonth: number | null; dayOfWeek: number | null; nextDueOn: string } | null>(null)

const formName = ref('')
const formAmount = ref('')
const formCurrencyCode = ref('')
const formCategoryId = ref('')
const formPaymentMethodId = ref('')
const formCadenceType = ref<'monthly' | 'weekly'>('monthly')
const formCadenceDayOfMonth = ref(5)
const formCadenceDayOfWeek = ref(0)
const formNotes = ref('')
const openPopover = ref<'category' | 'payment' | 'currency' | ''>('')
const openDetailRow = ref<'notes' | ''>('')
const submitting = ref(false)
const submitError = ref<NivaError | null>(null)

const formAmountDisplay = computed({
  get: () => formatAmountInput(formAmount.value || ''),
  set: (value: string) => {
    formAmount.value = cleanAmountInput(value)
  },
})

const expenseCategories = computed(() => topLevelCategories(categories.items.value, 'expense'))
const favoriteCategories = computed(() => expenseCategories.value.filter((c) => c.is_favorite))
const moreCategories = computed(() =>
  expenseCategories.value.filter((c) => !c.is_favorite && (c.is_active || c.id === formCategoryId.value)),
)
const categoryMoreSelectedLabel = computed(() => {
  if (!formCategoryId.value) return ''
  if (favoriteCategories.value.some((c) => c.id === formCategoryId.value)) return ''
  const match = moreCategories.value.find((c) => c.id === formCategoryId.value) ?? categories.items.value.find((c) => c.id === formCategoryId.value)
  return match?.name ?? ''
})

const favoritePaymentMethods = computed(() => paymentMethods.items.value.filter((p) => p.is_favorite))
const morePaymentMethods = computed(() =>
  paymentMethods.items.value.filter((p) => !p.is_favorite && (p.is_active || p.id === formPaymentMethodId.value)),
)
const paymentMoreSelectedLabel = computed(() => {
  if (!formPaymentMethodId.value) return ''
  if (favoritePaymentMethods.value.some((p) => p.id === formPaymentMethodId.value)) return ''
  const match = morePaymentMethods.value.find((p) => p.id === formPaymentMethodId.value) ?? paymentMethods.items.value.find((p) => p.id === formPaymentMethodId.value)
  return match?.name ?? ''
})

const enabledCurrencies = computed(() => currencies.rows.value.filter((r) => r.enabled))
const notesPreview = computed(() => {
  const value = formNotes.value.trim()
  if (!value) return ''
  return value.length > 22 ? `${value.slice(0, 22)}…` : value
})

function togglePopover(name: 'category' | 'payment' | 'currency') {
  openPopover.value = openPopover.value === name ? '' : name
}

function openAddForm() {
  editingId.value = null
  editingOriginal.value = null
  formName.value = ''
  formAmount.value = ''
  formCurrencyCode.value = defaultCurrencyCode.value
  formCategoryId.value = favoriteCategories.value[0]?.id ?? ''
  formPaymentMethodId.value = favoritePaymentMethods.value[0]?.id ?? ''
  formCadenceType.value = 'monthly'
  formCadenceDayOfMonth.value = 5
  formCadenceDayOfWeek.value = 0
  formNotes.value = ''
  submitError.value = null
  openPopover.value = ''
  openDetailRow.value = ''
  showForm.value = true
}

function openEditForm(item: RecurringPaymentWithLabels) {
  editingId.value = item.id
  editingOriginal.value = {
    cadenceType: item.cadence_type,
    dayOfMonth: item.cadence_day_of_month,
    dayOfWeek: item.cadence_day_of_week,
    nextDueOn: item.next_due_on,
  }
  formName.value = item.name
  formAmount.value = item.amount
  formCurrencyCode.value = item.currency_code
  formCategoryId.value = item.category_id
  formPaymentMethodId.value = item.payment_method_id
  formCadenceType.value = item.cadence_type
  formCadenceDayOfMonth.value = item.cadence_day_of_month ?? 5
  formCadenceDayOfWeek.value = item.cadence_day_of_week ?? 0
  formNotes.value = item.notes ?? ''
  submitError.value = null
  openPopover.value = ''
  openDetailRow.value = ''
  showForm.value = true
}

async function submitForm() {
  if (!workspaceId.value) return
  if (!activePropertyId.value) {
    submitError.value = { code: 'validation_error', message: 'No active property found for this workspace.', retryable: false }
    return
  }
  if (!formName.value.trim() || !formAmount.value || !formCategoryId.value || !formPaymentMethodId.value || !formCurrencyCode.value) {
    submitError.value = { code: 'validation_error', message: 'Fill in a name, amount, category, and payment method.', retryable: false }
    return
  }

  const dayOfMonth = formCadenceType.value === 'monthly' ? formCadenceDayOfMonth.value : null
  const dayOfWeek = formCadenceType.value === 'weekly' ? formCadenceDayOfWeek.value : null

  const cadenceUnchanged =
    editingOriginal.value !== null &&
    editingOriginal.value.cadenceType === formCadenceType.value &&
    editingOriginal.value.dayOfMonth === dayOfMonth &&
    editingOriginal.value.dayOfWeek === dayOfWeek

  const nextDueOn = cadenceUnchanged && editingOriginal.value ? editingOriginal.value.nextDueOn : computeNextDueOn(formCadenceType.value, dayOfMonth, dayOfWeek)

  const payload: RecurringPaymentPayload = {
    propertyId: activePropertyId.value,
    name: formName.value.trim(),
    categoryId: formCategoryId.value,
    paymentMethodId: formPaymentMethodId.value,
    currencyCode: formCurrencyCode.value,
    amount: formAmount.value,
    cadenceType: formCadenceType.value,
    cadenceDayOfMonth: dayOfMonth,
    cadenceDayOfWeek: dayOfWeek,
    nextDueOn,
    notes: formNotes.value,
  }

  submitting.value = true
  submitError.value = null
  const err = editingId.value ? await update(editingId.value, workspaceId.value, payload) : await create(workspaceId.value, payload)
  submitting.value = false

  if (err) {
    submitError.value = err
    return
  }
  toast.show(editingId.value ? 'Payment updated.' : 'Payment saved.')
  showForm.value = false
}

// ---- Delete ----------------------------------------------------------------

const pendingDelete = ref<RecurringPaymentWithLabels | null>(null)
const deleting = ref(false)

function requestDelete() {
  if (!editingId.value) return
  pendingDelete.value = items.value.find((i) => i.id === editingId.value) ?? null
  showForm.value = false
}

async function confirmDelete() {
  if (!pendingDelete.value || !workspaceId.value) return
  deleting.value = true
  const err = await remove(pendingDelete.value.id, workspaceId.value)
  deleting.value = false
  if (err) {
    toast.show(err.message, { tone: 'error' })
    pendingDelete.value = null
    return
  }
  toast.show('Payment deleted.')
  pendingDelete.value = null
}

// ---- Mark paid ---------------------------------------------------------

const markPaidTarget = ref<RecurringPaymentWithLabels | null>(null)
const markPaidAmount = ref('')
const markPaidDate = ref('')
const markPaidNotes = ref('')
const markingPaid = ref(false)
const markPaidError = ref<NivaError | null>(null)

const markPaidAmountDisplay = computed({
  get: () => formatAmountInput(markPaidAmount.value || ''),
  set: (value: string) => {
    markPaidAmount.value = cleanAmountInput(value)
  },
})

function openMarkPaid(item: RecurringPaymentWithLabels) {
  markPaidTarget.value = item
  markPaidAmount.value = item.amount
  markPaidDate.value = dayjs().format('YYYY-MM-DD')
  markPaidNotes.value = ''
  markPaidError.value = null
}

async function confirmMarkPaid() {
  if (!markPaidTarget.value || !workspaceId.value) return
  if (!markPaidAmount.value || !markPaidDate.value) {
    markPaidError.value = { code: 'validation_error', message: 'Enter an amount and date.', retryable: false }
    return
  }
  markingPaid.value = true
  markPaidError.value = null
  const { error: err } = await markPaid(workspaceId.value, markPaidTarget.value.id, markPaidAmount.value, markPaidDate.value, markPaidNotes.value)
  markingPaid.value = false
  if (err) {
    markPaidError.value = err
    return
  }
  toast.show(`Logged ${formatMoney(markPaidAmount.value, markPaidTarget.value.currency_code)} to Transactions.`)
  markPaidTarget.value = null
}
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pt-6 pb-24 md:pb-8">
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-h1 font-semibold text-neutral-900">Recurring payments</h1>
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-pill bg-white px-4 py-2 text-body-sm font-medium text-neutral-700 shadow-sm"
        @click="openAddForm"
      >
        <Plus :size="16" />
        Add
      </button>
    </div>

    <div v-if="loading && !hasAnyPayments" class="flex flex-col gap-2">
      <div v-for="i in 3" :key="i" class="h-20 animate-pulse rounded-md bg-neutral-100" />
    </div>

    <div v-else-if="error" class="flex items-center justify-between gap-3 rounded-md bg-negative-600/5 p-4 text-body-sm text-negative-600">
      <span>{{ error.message }}</span>
      <button type="button" class="font-medium underline" @click="workspaceId && list(workspaceId)">Try again</button>
    </div>

    <section v-else-if="!hasAnyPayments" class="rounded-md bg-white p-6 text-center shadow-sm">
      <h2 class="mb-1 text-h3 font-semibold text-neutral-900">No recurring payments yet</h2>
      <p class="mb-4 text-body-sm text-neutral-500">Add a bill or a staff wage to get reminded before it's due.</p>
      <button type="button" class="rounded-sm bg-accent-500 px-4 py-2 text-body-sm font-medium text-white hover:bg-accent-600" @click="openAddForm">
        Add payment
      </button>
    </section>

    <template v-else>
      <p class="mb-3 text-caption text-neutral-400">Tap a payment to edit or delete it. Only Mark paid logs a transaction.</p>

      <template v-if="grouped.overdue.length">
        <p class="mb-2 text-caption font-semibold uppercase tracking-wide text-negative-600">Overdue</p>
        <div class="mb-4 flex flex-col gap-2">
          <div v-for="{ item, due } in grouped.overdue" :key="item.id" class="cursor-pointer rounded-md bg-white p-4 shadow-sm hover:shadow-md" @click="openEditForm(item)">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate text-body font-semibold text-neutral-900">{{ item.name }}</p>
                <p class="truncate text-caption text-neutral-500">{{ subLabel(item) }}</p>
              </div>
              <div class="shrink-0 text-right">
                <p class="text-amount font-semibold text-neutral-900">{{ formatMoney(item.amount, item.currency_code) }}</p>
                <p class="text-caption text-negative-600">{{ due.label }}</p>
              </div>
            </div>
            <button
              type="button"
              class="mt-3 w-full rounded-pill bg-accent-500 py-2.5 text-body-sm font-semibold text-white hover:bg-accent-600"
              @click.stop="openMarkPaid(item)"
            >
              Mark paid
            </button>
          </div>
        </div>
      </template>

      <template v-if="grouped.upcoming.length">
        <p class="mb-2 text-caption font-semibold uppercase tracking-wide text-neutral-400">Upcoming</p>
        <div class="flex flex-col gap-2">
          <div v-for="{ item, due } in grouped.upcoming" :key="item.id" class="cursor-pointer rounded-md bg-white p-4 shadow-sm hover:shadow-md" @click="openEditForm(item)">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate text-body font-semibold text-neutral-900">{{ item.name }}</p>
                <p class="truncate text-caption text-neutral-500">{{ subLabel(item) }}</p>
              </div>
              <div class="shrink-0 text-right">
                <p class="text-amount font-semibold text-neutral-900">{{ formatMoney(item.amount, item.currency_code) }}</p>
                <p class="text-caption text-neutral-500">{{ due.label }}</p>
              </div>
            </div>
            <!-- Due today is payable now, same as overdue — see dueLabel()'s
                 canMarkPaid in src/lib/recurringPayments.ts. -->
            <button
              v-if="due.canMarkPaid"
              type="button"
              class="mt-3 w-full rounded-pill bg-accent-500 py-2.5 text-body-sm font-semibold text-white hover:bg-accent-600"
              @click.stop="openMarkPaid(item)"
            >
              Mark paid
            </button>
          </div>
        </div>
      </template>
    </template>

    <!-- Add/Edit sheet -->
    <BottomSheet :open="showForm" :title="editingId ? 'Edit payment' : 'Add payment'" @close="showForm = false">
      <form class="flex flex-col" @submit.prevent="submitForm">
        <div class="mb-4">
          <p class="mb-2 text-body-sm text-neutral-500">Name</p>
          <input
            v-model="formName"
            type="text"
            placeholder="Wifi, Electricity, Maria — wages…"
            class="w-full rounded-md bg-white px-3.5 py-3 text-body text-neutral-900 shadow-sm outline-none placeholder:text-neutral-400"
          />
        </div>

        <div class="mb-4 rounded-md bg-white p-4 shadow-sm">
          <div class="flex items-baseline justify-between">
            <span class="text-body-sm text-neutral-500">Amount</span>
            <button
              v-if="enabledCurrencies.length > 1"
              type="button"
              class="rounded-pill bg-neutral-100 px-2.5 py-1.5 text-caption font-semibold text-neutral-700"
              @click="togglePopover('currency')"
            >
              {{ formCurrencyCode }}
            </button>
            <span v-else class="rounded-pill bg-neutral-100 px-2.5 py-1.5 text-caption font-semibold text-neutral-500">{{ formCurrencyCode }}</span>
          </div>
          <input
            v-model="formAmountDisplay"
            type="text"
            inputmode="decimal"
            enterkeyhint="done"
            placeholder="0.00"
            class="w-full border-0 border-b-2 border-transparent bg-transparent pt-1 font-sans text-[26px] font-semibold text-neutral-900 outline-none focus:border-accent-500"
            @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
          />
        </div>
        <div v-if="openPopover === 'currency'" class="-mt-2 mb-4 overflow-hidden rounded-md bg-white shadow-md">
          <button
            v-for="c in enabledCurrencies"
            :key="c.code"
            type="button"
            class="block w-full px-4 py-3 text-left text-body text-neutral-900 hover:bg-neutral-50"
            @click="formCurrencyCode = c.code; openPopover = ''"
          >
            {{ c.code }}
          </button>
        </div>

        <div class="mb-4">
          <p class="mb-2 text-body-sm text-neutral-500">Category</p>
          <ChipPicker
            :favorites="favoriteCategories"
            :more-options="moreCategories"
            :selected-id="formCategoryId"
            :more-selected-label="categoryMoreSelectedLabel"
            :open="openPopover === 'category'"
            group-label="Category"
            @select-favorite="formCategoryId = $event; openPopover = ''"
            @select-more="formCategoryId = $event; openPopover = ''"
            @toggle-more="togglePopover('category')"
          />
        </div>

        <div class="mb-4">
          <p class="mb-2 text-body-sm text-neutral-500">Payment method</p>
          <ChipPicker
            :favorites="favoritePaymentMethods"
            :more-options="morePaymentMethods"
            :selected-id="formPaymentMethodId"
            :more-selected-label="paymentMoreSelectedLabel"
            :open="openPopover === 'payment'"
            group-label="Payment method"
            @select-favorite="formPaymentMethodId = $event; openPopover = ''"
            @select-more="formPaymentMethodId = $event; openPopover = ''"
            @toggle-more="togglePopover('payment')"
          />
        </div>

        <div class="mb-4">
          <p class="mb-2 text-body-sm text-neutral-500">Repeats</p>
          <div class="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-pill px-4 py-2.5 text-body-sm"
              :class="formCadenceType === 'monthly' ? 'bg-accent-100 font-semibold text-accent-700 shadow-none' : 'bg-white font-medium text-neutral-700 shadow-sm'"
              @click="formCadenceType = 'monthly'"
            >
              Monthly
            </button>
            <button
              type="button"
              class="rounded-pill px-4 py-2.5 text-body-sm"
              :class="formCadenceType === 'weekly' ? 'bg-accent-100 font-semibold text-accent-700 shadow-none' : 'bg-white font-medium text-neutral-700 shadow-sm'"
              @click="formCadenceType = 'weekly'"
            >
              Weekly
            </button>
          </div>

          <div v-if="formCadenceType === 'monthly'" class="flex items-center justify-between rounded-md bg-white p-3.5 shadow-sm">
            <span class="text-body-sm text-neutral-500">On day</span>
            <input v-model.number="formCadenceDayOfMonth" type="number" min="1" max="31" class="w-16 border-0 bg-transparent text-right text-body font-semibold text-neutral-900 outline-none" />
          </div>
          <div v-else class="flex flex-wrap gap-2">
            <button
              v-for="(day, idx) in WEEKDAY_NAMES"
              :key="day"
              type="button"
              class="rounded-pill px-3 py-1.5 text-caption"
              :class="formCadenceDayOfWeek === idx ? 'bg-accent-100 font-semibold text-accent-700' : 'bg-neutral-50 font-medium text-neutral-500'"
              @click="formCadenceDayOfWeek = idx"
            >
              {{ day.slice(0, 3) }}
            </button>
          </div>
        </div>

        <DetailRow
          label="Notes"
          :open="openDetailRow === 'notes'"
          :value-text="notesPreview"
          placeholder="Optional"
          @toggle="openDetailRow = openDetailRow === 'notes' ? '' : 'notes'"
        >
          <textarea
            v-model="formNotes"
            rows="2"
            placeholder="Optional context for this payment"
            class="w-full resize-none rounded-sm bg-neutral-50 p-2.5 text-body text-neutral-900 outline-none placeholder:text-neutral-400"
          />
        </DetailRow>

        <p v-if="submitError" class="mt-3 text-caption text-negative-600">{{ submitError.message }}</p>

        <button type="submit" :disabled="submitting" class="mt-5 rounded-lg bg-accent-500 py-3.5 text-body font-semibold text-white hover:bg-accent-600 disabled:opacity-60">
          {{ submitting ? 'Saving…' : 'Save payment' }}
        </button>
        <button
          v-if="editingId"
          type="button"
          class="mt-2.5 rounded-lg border border-negative-600/30 py-3 text-body-sm font-semibold text-negative-600 hover:bg-negative-600/5"
          @click="requestDelete"
        >
          Delete this payment
        </button>
      </form>
    </BottomSheet>

    <!-- Mark paid sheet -->
    <BottomSheet :open="!!markPaidTarget" title="Mark paid" @close="markPaidTarget = null">
      <div v-if="markPaidTarget" class="flex flex-col">
        <p class="mb-4 text-body-sm text-neutral-500">
          This logs a real expense in Transactions. Adjust the amount for overtime or a one-off change, and add a note if it helps explain it later.
        </p>
        <div class="mb-4 flex items-center justify-between">
          <span class="text-body-sm text-neutral-500">Amount</span>
          <input
            v-model="markPaidAmountDisplay"
            type="text"
            inputmode="decimal"
            class="w-32 rounded-md bg-white px-3 py-2 text-right text-body font-semibold text-neutral-900 shadow-sm outline-none"
          />
        </div>
        <div class="mb-4 flex items-center justify-between">
          <span class="text-body-sm text-neutral-500">Date</span>
          <input v-model="markPaidDate" type="date" class="rounded-md bg-white px-3 py-2 text-body text-neutral-900 shadow-sm outline-none" />
        </div>
        <div class="mb-4">
          <p class="mb-2 text-body-sm text-neutral-500">Notes (optional)</p>
          <input
            v-model="markPaidNotes"
            type="text"
            placeholder="e.g. 2 extra days worked"
            class="w-full rounded-md bg-white px-3.5 py-3 text-body text-neutral-900 shadow-sm outline-none placeholder:text-neutral-400"
          />
        </div>
        <p v-if="markPaidError" class="mb-3 text-caption text-negative-600">{{ markPaidError.message }}</p>
        <button type="button" :disabled="markingPaid" class="rounded-lg bg-accent-500 py-3.5 text-body font-semibold text-white hover:bg-accent-600 disabled:opacity-60" @click="confirmMarkPaid">
          {{ markingPaid ? 'Logging…' : 'Confirm payment' }}
        </button>
      </div>
    </BottomSheet>

    <ConfirmDialog
      :open="!!pendingDelete"
      title="Delete this recurring payment?"
      :description="pendingDelete ? `This stops future reminders for &quot;${pendingDelete.name}&quot;. It won't remove any transactions already logged from it.` : ''"
      confirm-label="Delete"
      danger
      :busy="deleting"
      @confirm="confirmDelete"
      @cancel="pendingDelete = null"
    />
  </div>
</template>
