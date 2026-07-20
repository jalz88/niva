<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import dayjs from 'dayjs'
import { transactionFormSchema, type TransactionFormValues, type TransactionPayload } from '@/lib/schemas/transaction'
import { useConfigItems } from '@/composables/useConfigItems'
import { useCategories, topLevelCategories, subcategoriesOf } from '@/composables/useCategories'
import { usePaymentMethods } from '@/composables/usePaymentMethods'
import { useCurrencies } from '@/composables/useCurrencies'
import { useSuppliers } from '@/composables/useSuppliers'
import type { NivaError } from '@/lib/errors'

const props = defineProps<{
  mode: 'create' | 'edit'
  workspaceId: string
  initialValues?: Partial<TransactionFormValues>
  onSubmit: (payload: TransactionPayload) => Promise<NivaError | null>
}>()

const emit = defineEmits<{ success: []; 'reload-requested': [] }>()

const properties = useConfigItems('properties')
const platforms = useConfigItems('platforms')
const paymentMethods = usePaymentMethods()
const categories = useCategories()
const currencies = useCurrencies()
const suppliers = useConfigItems('suppliers')

// No property field on this form — see 2026-07-20 real-user-testing
// feedback. Today there's exactly one active property, so it's assigned
// silently. Once a second property exists, a header property switcher
// (not built yet) becomes the "which property am I working on" control —
// this form still won't need a field for it.
const activePropertyId = computed(() => properties.items.value.find((p) => p.is_active)?.id ?? '')

watch(
  () => props.workspaceId,
  (id) => {
    if (!id) return
    properties.list(id)
    platforms.list(id)
    paymentMethods.list(id)
    categories.list(id)
    currencies.list(id)
    suppliers.list(id)
  },
  { immediate: true },
)

const defaultCurrency = computed(() => currencies.rows.value.find((r) => r.isDefault)?.code ?? '')

const { defineField, handleSubmit, errors, values, setFieldValue, resetForm } = useForm<TransactionFormValues>({
  validationSchema: toTypedSchema(transactionFormSchema),
  initialValues: {
    type: 'expense',
    amount: '',
    currencyCode: '',
    occurredOn: dayjs().format('YYYY-MM-DD'),
    categoryId: '',
    paymentMethodId: '',
    platformId: '',
    supplierName: '',
    notes: '',
    ...props.initialValues,
  },
})

// immediate: true matters here — useCurrencies() is session-cached (see
// useCurrencies.ts), so on the second-or-later Quick Add of a session,
// defaultCurrency is already correct the instant this watcher is created
// and never "changes" again, meaning a non-immediate watch would never
// fire and the field would stay blank, forcing an extra manual pick every
// time. That's the bug real-user testing surfaced as "select the currency
// again" friction — the whole point of a default is zero clicks.
watch(
  defaultCurrency,
  (code) => {
    if (props.mode === 'create' && code && !values.currencyCode) {
      setFieldValue('currencyCode', code)
    }
  },
  { immediate: true },
)

const [type] = defineField('type')
const [amount, amountAttrs] = defineField('amount')
const [currencyCode] = defineField('currencyCode')
const [occurredOn, occurredOnAttrs] = defineField('occurredOn')
const [categoryId] = defineField('categoryId')
const [paymentMethodId] = defineField('paymentMethodId')
const [platformId, platformIdAttrs] = defineField('platformId')
const [supplierName, supplierNameAttrs] = defineField('supplierName')
const [notes] = defineField('notes')

// ---- Category: favorite chips + "more" + optional sub-category --------
// Everything here derives from categoryId + the loaded category list, so
// edit-mode prefill (categoryId already pointing at a leaf sub-category)
// "just works" once categories finish loading — no separate init step.

const currentCategory = computed(() => categories.items.value.find((c) => c.id === categoryId.value) ?? null)
const currentTopCategoryId = computed(() =>
  currentCategory.value ? (currentCategory.value.parent_category_id ?? currentCategory.value.id) : '',
)
const currentSubcategoryId = computed(() => (currentCategory.value?.parent_category_id ? currentCategory.value.id : ''))

const favoriteCategories = computed(() => topLevelCategories(categories.items.value, type.value).filter((c) => c.is_favorite))
const moreCategories = computed(() =>
  topLevelCategories(categories.items.value, type.value).filter(
    (c) => !c.is_favorite && (c.is_active || c.id === currentTopCategoryId.value),
  ),
)
const subcategoryOptions = computed(() =>
  currentTopCategoryId.value
    ? subcategoriesOf(categories.items.value, currentTopCategoryId.value).filter(
        (c) => c.is_active || c.id === currentSubcategoryId.value,
      )
    : [],
)
const showSubcategoryRow = computed(() => subcategoryOptions.value.length > 0)
const noCategoriesAvailable = computed(() => favoriteCategories.value.length === 0 && moreCategories.value.length === 0)

const categoryMoreValue = computed({
  get: () => (favoriteCategories.value.some((c) => c.id === currentTopCategoryId.value) ? '' : currentTopCategoryId.value),
  // Picking a different top-level category always clears any sub-category
  // selection, since categoryId becomes that top-level id directly.
  set: (id: string) => setFieldValue('categoryId', id),
})
const subcategorySelectValue = computed({
  get: () => currentSubcategoryId.value,
  set: (id: string) => setFieldValue('categoryId', id || currentTopCategoryId.value),
})

// Switching Income/Expense invalidates whatever category was selected for
// the other type.
watch(type, () => {
  if (currentCategory.value && currentCategory.value.type !== type.value) {
    setFieldValue('categoryId', '')
  }
})

// ---- Payment method: favorite chips + "more" ----------------------------

const favoritePaymentMethods = computed(() => paymentMethods.items.value.filter((p) => p.is_favorite))
const morePaymentMethods = computed(() =>
  paymentMethods.items.value.filter((p) => !p.is_favorite && (p.is_active || p.id === paymentMethodId.value)),
)
const paymentMoreValue = computed({
  get: () => (favoritePaymentMethods.value.some((p) => p.id === paymentMethodId.value) ? '' : paymentMethodId.value),
  set: (id: string) => setFieldValue('paymentMethodId', id),
})

// ---- Platform (income) ---------------------------------------------------

const platformOptions = computed(() => platforms.items.value.filter((p) => p.is_active || p.id === props.initialValues?.platformId))

// ---- Supplier: pick existing or type a new one ---------------------------

const supplierOptions = computed(() => suppliers.items.value.filter((s) => s.is_active || s.name === props.initialValues?.supplierName))
// Editing a transaction that already has a supplier: show it as free text
// straight away rather than guessing whether it's still in the active list.
const supplierMode = ref<'select' | 'new'>(props.initialValues?.supplierName ? 'new' : 'select')
const supplierSelectValue = ref('')

function onSupplierSelectChange() {
  if (supplierSelectValue.value === '__new__') {
    supplierMode.value = 'new'
    setFieldValue('supplierName', '')
  } else {
    setFieldValue('supplierName', supplierSelectValue.value)
  }
}

function backToSupplierSelect() {
  supplierMode.value = 'select'
  supplierSelectValue.value = ''
  setFieldValue('supplierName', '')
}

// ---- Submit ---------------------------------------------------------------

const showNotes = ref(!!props.initialValues?.notes)
const submitting = ref(false)
const submitError = ref<NivaError | null>(null)

const submitLabel = computed(() => {
  if (submitting.value) return 'Saving…'
  if (props.mode === 'edit') return 'Save changes'
  return type.value === 'income' ? 'Save income' : 'Save expense'
})

const onFormSubmit = handleSubmit(async (formValues) => {
  if (!activePropertyId.value) {
    submitError.value = {
      code: 'validation_error',
      message: 'No active property found for this workspace. Add one in Administration first.',
      retryable: false,
    }
    return
  }

  submitting.value = true
  submitError.value = null

  let supplierId: string | undefined
  if (formValues.type === 'expense' && formValues.supplierName?.trim()) {
    const { findOrCreate } = useSuppliers()
    const result = await findOrCreate(props.workspaceId, formValues.supplierName)
    if (result.error) {
      submitting.value = false
      submitError.value = result.error
      return
    }
    supplierId = result.id ?? undefined
  }

  const payload: TransactionPayload = {
    type: formValues.type,
    amount: formValues.amount,
    currencyCode: formValues.currencyCode,
    occurredOn: formValues.occurredOn,
    propertyId: activePropertyId.value,
    categoryId: formValues.categoryId,
    paymentMethodId: formValues.paymentMethodId,
    platformId: formValues.platformId,
    supplierId,
    notes: formValues.notes,
  }

  const result = await props.onSubmit(payload)
  submitting.value = false

  if (result) {
    submitError.value = result
    return
  }

  emit('success')
  if (props.mode === 'create') {
    // Keep last-used category/payment method/date/currency — only clear
    // what's specific to this one entry, per
    // docs/04-ui-ux-principles.md §4 "Default intelligently".
    resetForm({ values: { ...values, amount: '', notes: '', supplierName: '' } })
    showNotes.value = false
    supplierMode.value = 'select'
    supplierSelectValue.value = ''
  }
})
</script>

<template>
  <form class="flex flex-col gap-4" @submit="onFormSubmit">
    <!-- Type toggle -->
    <div class="grid grid-cols-2 gap-2">
      <button
        type="button"
        class="rounded-sm border py-3 text-body font-semibold"
        :class="type === 'income' ? 'border-positive-600 bg-positive-600/10 text-positive-600' : 'border-neutral-200 text-neutral-500'"
        @click="setFieldValue('type', 'income')"
      >
        Income
      </button>
      <button
        type="button"
        class="rounded-sm border py-3 text-body font-semibold"
        :class="type === 'expense' ? 'border-negative-600 bg-negative-600/10 text-negative-600' : 'border-neutral-200 text-neutral-500'"
        @click="setFieldValue('type', 'expense')"
      >
        Expense
      </button>
    </div>

    <!-- Amount + currency -->
    <div>
      <label class="mb-1 block text-body-sm text-neutral-700" for="tx-amount">Amount</label>
      <div class="flex gap-2">
        <select
          v-if="currencies.rows.value.filter((r) => r.enabled).length > 1"
          v-model="currencyCode"
          class="rounded-sm border border-neutral-200 bg-white p-2.5 text-body focus:border-accent-500 focus:outline-none"
        >
          <option v-for="c in currencies.rows.value.filter((r) => r.enabled)" :key="c.code" :value="c.code">{{ c.code }}</option>
        </select>
        <span v-else class="flex items-center rounded-sm border border-neutral-200 bg-neutral-100 px-3 text-body text-neutral-500">
          {{ currencyCode }}
        </span>
        <input
          id="tx-amount"
          v-model="amount"
          v-bind="amountAttrs"
          type="text"
          inputmode="decimal"
          placeholder="0.00"
          class="flex-1 rounded-sm border border-neutral-200 bg-white p-2.5 text-amount font-semibold focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
        />
      </div>
      <p v-if="errors.amount" class="mt-1 text-caption text-negative-600">{{ errors.amount }}</p>
    </div>

    <!-- Date -->
    <div>
      <label class="mb-1 block text-body-sm text-neutral-700" for="tx-date">Date</label>
      <input
        id="tx-date"
        v-model="occurredOn"
        v-bind="occurredOnAttrs"
        type="date"
        class="w-full rounded-sm border border-neutral-200 bg-white p-2.5 text-body focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
      />
      <p v-if="errors.occurredOn" class="mt-1 text-caption text-negative-600">{{ errors.occurredOn }}</p>
    </div>

    <!-- Category -->
    <div>
      <label class="mb-1 block text-body-sm text-neutral-700">Category</label>

      <div v-if="favoriteCategories.length" class="mb-2 grid grid-cols-3 gap-2">
        <button
          v-for="c in favoriteCategories"
          :key="c.id"
          type="button"
          :aria-pressed="currentTopCategoryId === c.id"
          class="rounded-sm border px-2 py-2.5 text-caption font-medium leading-tight"
          :class="
            currentTopCategoryId === c.id
              ? 'border-accent-500 bg-accent-50 text-accent-700'
              : 'border-neutral-200 text-neutral-700 hover:bg-neutral-100'
          "
          @click="setFieldValue('categoryId', c.id)"
        >
          {{ c.name }}
        </button>
      </div>

      <select
        v-if="moreCategories.length"
        v-model="categoryMoreValue"
        class="w-full rounded-sm border border-neutral-200 bg-white p-2.5 text-body focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
      >
        <option value="">More categories…</option>
        <option v-for="c in moreCategories" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>

      <p v-if="errors.categoryId" class="mt-1 text-caption text-negative-600">{{ errors.categoryId }}</p>
      <p v-if="noCategoriesAvailable" class="mt-1 text-caption text-neutral-500">
        No {{ type }} categories yet — add one in Administration → Categories.
      </p>

      <div v-if="showSubcategoryRow" class="mt-2">
        <label class="mb-1 block text-body-sm text-neutral-700" for="tx-subcategory">Sub-category (optional)</label>
        <select
          id="tx-subcategory"
          v-model="subcategorySelectValue"
          class="w-full rounded-sm border border-neutral-200 bg-white p-2.5 text-body focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
        >
          <option value="">None</option>
          <option v-for="c in subcategoryOptions" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </div>
    </div>

    <!-- Payment method -->
    <div>
      <label class="mb-1 block text-body-sm text-neutral-700">Payment method</label>

      <div v-if="favoritePaymentMethods.length" class="mb-2 grid grid-cols-3 gap-2">
        <button
          v-for="p in favoritePaymentMethods"
          :key="p.id"
          type="button"
          :aria-pressed="paymentMethodId === p.id"
          class="rounded-sm border px-2 py-2.5 text-caption font-medium leading-tight"
          :class="
            paymentMethodId === p.id
              ? 'border-accent-500 bg-accent-50 text-accent-700'
              : 'border-neutral-200 text-neutral-700 hover:bg-neutral-100'
          "
          @click="setFieldValue('paymentMethodId', p.id)"
        >
          {{ p.name }}
        </button>
      </div>

      <select
        v-if="morePaymentMethods.length"
        v-model="paymentMoreValue"
        class="w-full rounded-sm border border-neutral-200 bg-white p-2.5 text-body focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
      >
        <option value="">More payment methods…</option>
        <option v-for="p in morePaymentMethods" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>

      <p v-if="errors.paymentMethodId" class="mt-1 text-caption text-negative-600">{{ errors.paymentMethodId }}</p>
    </div>

    <!-- Platform (income) -->
    <div v-if="type === 'income'">
      <label class="mb-1 block text-body-sm text-neutral-700" for="tx-platform">Platform (optional)</label>
      <select
        id="tx-platform"
        v-model="platformId"
        v-bind="platformIdAttrs"
        class="w-full rounded-sm border border-neutral-200 bg-white p-2.5 text-body focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
      >
        <option value="">None</option>
        <option v-for="p in platformOptions" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
    </div>

    <!-- Supplier (expense) — pick existing or add a new one -->
    <div v-else>
      <label class="mb-1 block text-body-sm text-neutral-700" for="tx-supplier">Supplier (optional)</label>
      <select
        v-if="supplierMode === 'select'"
        id="tx-supplier"
        v-model="supplierSelectValue"
        class="w-full rounded-sm border border-neutral-200 bg-white p-2.5 text-body focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
        @change="onSupplierSelectChange"
      >
        <option value="">None</option>
        <option v-for="s in supplierOptions" :key="s.id" :value="s.name">{{ s.name }}</option>
        <option value="__new__">+ Add new supplier…</option>
      </select>
      <div v-else class="flex flex-col gap-1.5">
        <input
          id="tx-supplier"
          v-model="supplierName"
          v-bind="supplierNameAttrs"
          type="text"
          placeholder="Supplier name"
          class="w-full rounded-sm border border-neutral-200 bg-white p-2.5 text-body focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
        />
        <button
          v-if="supplierOptions.length"
          type="button"
          class="self-start text-caption font-medium text-accent-600 hover:text-accent-700"
          @click="backToSupplierSelect"
        >
          Choose an existing supplier instead
        </button>
      </div>
    </div>

    <!-- Notes -->
    <button
      v-if="!showNotes"
      type="button"
      class="self-start text-body-sm font-medium text-accent-600 hover:text-accent-700"
      @click="showNotes = true"
    >
      + Add a note
    </button>
    <div v-else>
      <label class="mb-1 block text-body-sm text-neutral-700" for="tx-notes">Notes (optional)</label>
      <textarea
        id="tx-notes"
        v-model="notes"
        rows="2"
        class="w-full rounded-sm border border-neutral-200 bg-white p-2.5 text-body focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
      />
    </div>

    <div
      v-if="submitError"
      class="rounded-md border border-negative-600/30 bg-negative-600/5 p-3 text-body-sm text-negative-600"
      role="alert"
    >
      {{ submitError.message }}
      <button
        v-if="submitError.code === 'conflict'"
        type="button"
        class="ml-2 font-semibold underline"
        @click="emit('reload-requested')"
      >
        Reload
      </button>
    </div>

    <button
      type="submit"
      :disabled="submitting"
      class="rounded-sm bg-accent-500 p-3 text-body font-semibold text-white hover:bg-accent-600 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500"
    >
      {{ submitLabel }}
    </button>
  </form>
</template>
