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
import ChipPicker from '@/components/ui/ChipPicker.vue'
import DetailRow from '@/components/ui/DetailRow.vue'
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
// feedback, reaffirmed 2026-08-06 (docs/12-ux-options-review.md C.9). While
// there's exactly one active property, it's assigned silently. Once a
// second property exists, this title becomes "Add transaction for
// [Property]" with a quiet tappable switch (prototyped in
// docs/quick-add-prototype.html) — deliberately not built yet since it
// isn't exercisable with today's single-property reality.
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
const [platformId] = defineField('platformId')
const [supplierName, supplierNameAttrs] = defineField('supplierName')
const [notes] = defineField('notes')

// ---- Minimalist UI state — docs/08-design-system.md §5.1 -----------------
// Only one "More" popover and one collapsed-field expansion open at a
// time, mirroring docs/quick-add-prototype.html's single-flag state.
const openPopover = ref<'category' | 'payment' | 'currency' | ''>('')
const openDetailRow = ref<'date' | 'platform' | 'supplier' | 'notes' | ''>('')

function togglePopover(name: 'category' | 'payment' | 'currency') {
  openPopover.value = openPopover.value === name ? '' : name
}
function openDetail(row: 'date' | 'platform' | 'supplier' | 'notes') {
  openDetailRow.value = row
}
function closeDetail() {
  openDetailRow.value = ''
}

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

// Name shown on the category "More" chip when the current selection came
// from overflow rather than the favorite row — null/'' keeps the chip
// reading as plain "More".
const categoryMoreSelectedLabel = computed(() => {
  if (!currentTopCategoryId.value) return ''
  if (favoriteCategories.value.some((c) => c.id === currentTopCategoryId.value)) return ''
  const match =
    moreCategories.value.find((c) => c.id === currentTopCategoryId.value) ??
    categories.items.value.find((c) => c.id === currentTopCategoryId.value)
  return match?.name ?? ''
})

function selectFavoriteCategory(id: string) {
  setFieldValue('categoryId', id)
  openPopover.value = ''
}
function selectMoreCategory(id: string) {
  setFieldValue('categoryId', id)
  openPopover.value = ''
}
function selectSubcategory(id: string) {
  setFieldValue('categoryId', currentSubcategoryId.value === id ? currentTopCategoryId.value : id)
}

// Switching Income/Expense invalidates whatever category was selected for
// the other type, and closes anything open.
watch(type, () => {
  if (currentCategory.value && currentCategory.value.type !== type.value) {
    setFieldValue('categoryId', '')
  }
  openPopover.value = ''
  openDetailRow.value = ''
})

// ---- Payment method: favorite chips + "more" ----------------------------

const favoritePaymentMethods = computed(() => paymentMethods.items.value.filter((p) => p.is_favorite))
const morePaymentMethods = computed(() =>
  paymentMethods.items.value.filter((p) => !p.is_favorite && (p.is_active || p.id === paymentMethodId.value)),
)
const paymentMoreSelectedLabel = computed(() => {
  if (!paymentMethodId.value) return ''
  if (favoritePaymentMethods.value.some((p) => p.id === paymentMethodId.value)) return ''
  const match =
    morePaymentMethods.value.find((p) => p.id === paymentMethodId.value) ??
    paymentMethods.items.value.find((p) => p.id === paymentMethodId.value)
  return match?.name ?? ''
})

function selectFavoritePayment(id: string) {
  setFieldValue('paymentMethodId', id)
  openPopover.value = ''
}
function selectMorePayment(id: string) {
  setFieldValue('paymentMethodId', id)
  openPopover.value = ''
}

// ---- Currency — borderless popover instead of native <select> ------------

const enabledCurrencies = computed(() => currencies.rows.value.filter((r) => r.enabled))

function selectCurrency(code: string) {
  setFieldValue('currencyCode', code)
  openPopover.value = ''
}

// ---- Platform (income) ---------------------------------------------------

const platformOptions = computed(() => platforms.items.value.filter((p) => p.is_active || p.id === props.initialValues?.platformId))
const platformName = computed(() => platformOptions.value.find((p) => p.id === platformId.value)?.name ?? '')

function pickPlatform(id: string) {
  setFieldValue('platformId', id)
  closeDetail()
}

// ---- Supplier: pick existing or type a new one ---------------------------

const supplierOptions = computed(() => suppliers.items.value.filter((s) => s.is_active || s.name === props.initialValues?.supplierName))
// Editing a transaction that already has a supplier: show it as free text
// straight away rather than guessing whether it's still in the active list.
const supplierMode = ref<'select' | 'new'>(props.initialValues?.supplierName ? 'new' : 'select')

function pickSupplier(name: string) {
  setFieldValue('supplierName', name)
  closeDetail()
}
function startNewSupplier() {
  supplierMode.value = 'new'
  setFieldValue('supplierName', '')
}
function backToSupplierSelect() {
  supplierMode.value = 'select'
  setFieldValue('supplierName', '')
}

// ---- Date / Notes display helpers -----------------------------------------

const formattedDate = computed(() => {
  const d = dayjs(occurredOn.value)
  return d.isValid() ? d.format('D MMM YYYY') : ''
})
function onDateChange() {
  closeDetail()
}
const notesPreview = computed(() => {
  const value = (notes.value ?? '').trim()
  if (!value) return ''
  return value.length > 22 ? `${value.slice(0, 22)}…` : value
})
function onNotesBlur() {
  closeDetail()
}

// ---- Submit ---------------------------------------------------------------

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
    supplierMode.value = 'select'
    openPopover.value = ''
    openDetailRow.value = ''
  }
})
</script>

<template>
  <form class="flex flex-col" @submit="onFormSubmit">
    <!-- Amount and type -->
    <div class="mb-5">
      <p class="mb-2.5 text-caption font-semibold uppercase tracking-wide text-neutral-400">Amount and type</p>

      <div class="relative mb-3.5 flex rounded-pill bg-white p-1 shadow-sm">
        <div
          class="absolute inset-y-1 w-[calc(50%-4px)] rounded-pill transition-transform duration-200 ease-out"
          :class="type === 'income' ? 'translate-x-0 bg-positive-600' : 'translate-x-full bg-accent-500'"
        />
        <button
          type="button"
          class="relative z-10 flex-1 py-3 text-body font-semibold"
          :class="type === 'income' ? 'text-white' : 'text-neutral-500'"
          @click="setFieldValue('type', 'income')"
        >
          Income
        </button>
        <button
          type="button"
          class="relative z-10 flex-1 py-3 text-body font-semibold"
          :class="type === 'expense' ? 'text-white' : 'text-neutral-500'"
          @click="setFieldValue('type', 'expense')"
        >
          Expense
        </button>
      </div>

      <div class="rounded-md bg-white p-4 shadow-sm">
        <div class="flex items-baseline justify-between">
          <label for="tx-amount" class="text-body-sm text-neutral-500">Amount</label>
          <button
            v-if="enabledCurrencies.length > 1"
            type="button"
            class="rounded-pill bg-neutral-100 px-2.5 py-1.5 text-caption font-semibold text-neutral-700"
            @click="togglePopover('currency')"
          >
            {{ currencyCode }}
          </button>
          <span v-else class="rounded-pill bg-neutral-100 px-2.5 py-1.5 text-caption font-semibold text-neutral-500">
            {{ currencyCode }}
          </span>
        </div>
        <input
          id="tx-amount"
          v-model="amount"
          v-bind="amountAttrs"
          type="text"
          inputmode="decimal"
          placeholder="0.00"
          class="w-full border-0 border-b-2 border-transparent bg-transparent pt-1 font-sans text-[26px] font-semibold text-neutral-900 outline-none focus:border-accent-500"
        />
      </div>
      <div v-if="openPopover === 'currency'" class="mt-2 overflow-hidden rounded-md bg-white shadow-md">
        <button
          v-for="c in enabledCurrencies"
          :key="c.code"
          type="button"
          class="block w-full px-4 py-3 text-left text-body text-neutral-900 hover:bg-neutral-50"
          @click="selectCurrency(c.code)"
        >
          {{ c.code }}
        </button>
      </div>
      <p v-if="errors.amount" class="mt-1 text-caption text-negative-600">{{ errors.amount }}</p>
    </div>

    <!-- Category / Payment method — no wrapping group label, see
         docs/12-ux-options-review.md C.11/C.12 -->
    <div class="mb-5">
      <p class="mb-2 text-body-sm text-neutral-500">Category</p>
      <ChipPicker
        group-label="Category"
        :favorites="favoriteCategories"
        :more-options="moreCategories"
        :selected-id="currentTopCategoryId"
        :more-selected-label="categoryMoreSelectedLabel"
        :open="openPopover === 'category'"
        @select-favorite="selectFavoriteCategory"
        @select-more="selectMoreCategory"
        @toggle-more="togglePopover('category')"
      />
      <p v-if="errors.categoryId" class="mt-1 text-caption text-negative-600">{{ errors.categoryId }}</p>
      <p v-if="noCategoriesAvailable" class="mt-1 text-caption text-neutral-500">
        No {{ type }} categories yet — add one in Administration → Categories.
      </p>

      <div v-if="showSubcategoryRow" class="mt-2 flex flex-wrap gap-1.5">
        <button
          v-for="c in subcategoryOptions"
          :key="c.id"
          type="button"
          :aria-pressed="currentSubcategoryId === c.id"
          class="rounded-pill bg-neutral-50 px-3 py-1.5 text-caption font-medium text-neutral-500"
          :class="currentSubcategoryId === c.id ? 'bg-accent-100 font-semibold text-accent-700' : ''"
          @click="selectSubcategory(c.id)"
        >
          {{ c.name }}
        </button>
      </div>

      <div class="h-3.5" />

      <p class="mb-2 text-body-sm text-neutral-500">Payment method</p>
      <ChipPicker
        group-label="Payment method"
        :favorites="favoritePaymentMethods"
        :more-options="morePaymentMethods"
        :selected-id="paymentMethodId"
        :more-selected-label="paymentMoreSelectedLabel"
        :open="openPopover === 'payment'"
        @select-favorite="selectFavoritePayment"
        @select-more="selectMorePayment"
        @toggle-more="togglePopover('payment')"
      />
      <p v-if="errors.paymentMethodId" class="mt-1 text-caption text-negative-600">{{ errors.paymentMethodId }}</p>
    </div>

    <!-- Details -->
    <div class="mb-1">
      <p class="mb-1 text-caption font-semibold uppercase tracking-wide text-neutral-400">Details</p>

      <DetailRow label="Date" :open="openDetailRow === 'date'" :value-text="formattedDate" placeholder="Today" @toggle="openDetail('date')">
        <input
          id="tx-date"
          v-model="occurredOn"
          v-bind="occurredOnAttrs"
          type="date"
          class="w-full border-0 border-b-2 border-neutral-300 bg-transparent py-1.5 font-sans text-body text-neutral-900 outline-none focus:border-accent-500"
          @change="onDateChange"
        />
      </DetailRow>
      <p v-if="errors.occurredOn" class="mt-1 text-caption text-negative-600">{{ errors.occurredOn }}</p>

      <DetailRow
        v-if="type === 'income'"
        label="Platform (optional)"
        :open="openDetailRow === 'platform'"
        :value-text="platformName"
        placeholder="None"
        @toggle="openDetail('platform')"
      >
        <div class="flex flex-col">
          <button
            v-for="p in platformOptions"
            :key="p.id"
            type="button"
            class="border-0 bg-transparent py-2.5 text-left text-body text-neutral-900 hover:text-accent-600"
            @click="pickPlatform(p.id)"
          >
            {{ p.name }}
          </button>
          <button type="button" class="border-0 bg-transparent py-2.5 text-left text-body text-neutral-900 hover:text-accent-600" @click="pickPlatform('')">
            None
          </button>
        </div>
      </DetailRow>

      <DetailRow
        v-else
        label="Supplier (optional)"
        :open="openDetailRow === 'supplier'"
        :value-text="supplierName"
        placeholder="None"
        @toggle="openDetail('supplier')"
      >
        <div v-if="supplierMode === 'select'" class="flex flex-col">
          <button
            v-for="s in supplierOptions"
            :key="s.id"
            type="button"
            class="border-0 bg-transparent py-2.5 text-left text-body text-neutral-900 hover:text-accent-600"
            @click="pickSupplier(s.name)"
          >
            {{ s.name }}
          </button>
          <button type="button" class="border-0 bg-transparent py-2.5 text-left text-body text-neutral-900 hover:text-accent-600" @click="pickSupplier('')">
            None
          </button>
          <button type="button" class="border-0 bg-transparent py-2.5 text-left text-body text-accent-600 hover:text-accent-700" @click="startNewSupplier">
            + Add new supplier…
          </button>
        </div>
        <div v-else class="flex flex-col gap-1">
          <input
            id="tx-supplier"
            v-model="supplierName"
            v-bind="supplierNameAttrs"
            type="text"
            placeholder="Supplier name"
            class="w-full border-0 border-b-2 border-neutral-300 bg-transparent py-1.5 font-sans text-body text-neutral-900 outline-none focus:border-accent-500"
          />
          <button
            v-if="supplierOptions.length"
            type="button"
            class="self-start border-0 bg-transparent p-0 pt-1 text-caption font-medium text-accent-600 hover:text-accent-700"
            @click="backToSupplierSelect"
          >
            Choose an existing supplier instead
          </button>
        </div>
      </DetailRow>

      <DetailRow label="Notes (optional)" :open="openDetailRow === 'notes'" :value-text="notesPreview" placeholder="Add a note" @toggle="openDetail('notes')">
        <textarea
          id="tx-notes"
          v-model="notes"
          rows="2"
          class="w-full resize-y rounded-sm bg-neutral-50 p-2.5 font-sans text-body text-neutral-900 outline-none"
          @blur="onNotesBlur"
        />
      </DetailRow>
    </div>

    <div v-if="submitError" class="mt-4 rounded-md bg-negative-600/5 p-3 text-body-sm text-negative-600" role="alert">
      {{ submitError.message }}
      <button
        v-if="submitError.code === 'conflict'"
        type="button"
        class="ml-2 border-0 bg-transparent p-0 font-semibold underline"
        @click="emit('reload-requested')"
      >
        Reload
      </button>
    </div>

    <button
      type="submit"
      :disabled="submitting"
      class="mt-5 rounded-lg bg-accent-500 p-4 text-body font-semibold text-white hover:bg-accent-600 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-50"
    >
      {{ submitLabel }}
    </button>
  </form>
</template>
