<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import dayjs from 'dayjs'
import { transactionFormSchema, type TransactionFormValues, type TransactionPayload } from '@/lib/schemas/transaction'
import { useConfigItems } from '@/composables/useConfigItems'
import { useCategories } from '@/composables/useCategories'
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
const paymentMethods = useConfigItems('payment_methods')
const categories = useCategories()
const currencies = useCurrencies()

watch(
  () => props.workspaceId,
  (id) => {
    if (!id) return
    properties.list(id)
    platforms.list(id)
    paymentMethods.list(id)
    categories.list(id)
    currencies.list(id)
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
    propertyId: '',
    categoryId: '',
    paymentMethodId: '',
    platformId: '',
    supplierName: '',
    notes: '',
    ...props.initialValues,
  },
})

// Default the currency once it's known, for create only — editing an
// existing transaction keeps whatever currency it was recorded in.
watch(defaultCurrency, (code) => {
  if (props.mode === 'create' && code && !values.currencyCode) {
    setFieldValue('currencyCode', code)
  }
})

const [type] = defineField('type')
const [amount, amountAttrs] = defineField('amount')
const [currencyCode] = defineField('currencyCode')
const [occurredOn, occurredOnAttrs] = defineField('occurredOn')
const [propertyId, propertyIdAttrs] = defineField('propertyId')
const [categoryId, categoryIdAttrs] = defineField('categoryId')
const [paymentMethodId, paymentMethodIdAttrs] = defineField('paymentMethodId')
const [platformId, platformIdAttrs] = defineField('platformId')
const [supplierName, supplierNameAttrs] = defineField('supplierName')
const [notes] = defineField('notes')

// Reset the category when it no longer matches the chosen type, so an
// invalid income/expense + category combination can never be submitted —
// see docs/07-domain-model-and-schema.md §5.
watch(type, () => {
  const current = categories.items.value.find((c) => c.id === categoryId.value)
  if (current && current.type !== type.value) setFieldValue('categoryId', '')
})

const propertyOptions = computed(() => properties.items.value.filter((p) => p.is_active || p.id === props.initialValues?.propertyId))
const platformOptions = computed(() => platforms.items.value.filter((p) => p.is_active || p.id === props.initialValues?.platformId))
const paymentMethodOptions = computed(() =>
  paymentMethods.items.value.filter((p) => p.is_active || p.id === props.initialValues?.paymentMethodId),
)
const categoryOptions = computed(() =>
  categories.items.value.filter((c) => c.type === type.value && (c.is_active || c.id === props.initialValues?.categoryId)),
)
const currencyOptions = computed(() => currencies.rows.value.filter((r) => r.enabled))

const showNotes = ref(!!props.initialValues?.notes)
const submitting = ref(false)
const submitError = ref<NivaError | null>(null)

const submitLabel = computed(() => {
  if (submitting.value) return 'Saving…'
  if (props.mode === 'edit') return 'Save changes'
  return type.value === 'income' ? 'Save income' : 'Save expense'
})

const onFormSubmit = handleSubmit(async (formValues) => {
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
    propertyId: formValues.propertyId,
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
    // Keep last-used property/category/payment method/date/currency —
    // only clear the fields that are specific to this one entry, per
    // docs/04-ui-ux-principles.md §4 "Default intelligently".
    resetForm({ values: { ...values, amount: '', notes: '', supplierName: '' } })
    showNotes.value = false
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
          v-if="currencyOptions.length > 1"
          v-model="currencyCode"
          class="rounded-sm border border-neutral-200 bg-white p-2.5 text-body focus:border-accent-500 focus:outline-none"
        >
          <option v-for="c in currencyOptions" :key="c.code" :value="c.code">{{ c.code }}</option>
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

    <!-- Property -->
    <div>
      <label class="mb-1 block text-body-sm text-neutral-700" for="tx-property">Property</label>
      <select
        id="tx-property"
        v-model="propertyId"
        v-bind="propertyIdAttrs"
        class="w-full rounded-sm border border-neutral-200 bg-white p-2.5 text-body focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
      >
        <option value="" disabled>Choose a property</option>
        <option v-for="p in propertyOptions" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
      <p v-if="errors.propertyId" class="mt-1 text-caption text-negative-600">{{ errors.propertyId }}</p>
    </div>

    <!-- Category -->
    <div>
      <label class="mb-1 block text-body-sm text-neutral-700" for="tx-category">Category</label>
      <select
        id="tx-category"
        v-model="categoryId"
        v-bind="categoryIdAttrs"
        class="w-full rounded-sm border border-neutral-200 bg-white p-2.5 text-body focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
      >
        <option value="" disabled>Choose a category</option>
        <option v-for="c in categoryOptions" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <p v-if="errors.categoryId" class="mt-1 text-caption text-negative-600">{{ errors.categoryId }}</p>
      <p v-if="categoryOptions.length === 0" class="mt-1 text-caption text-neutral-500">
        No {{ type }} categories yet — add one in Administration → Categories.
      </p>
    </div>

    <!-- Payment method -->
    <div>
      <label class="mb-1 block text-body-sm text-neutral-700" for="tx-payment-method">Payment method</label>
      <select
        id="tx-payment-method"
        v-model="paymentMethodId"
        v-bind="paymentMethodIdAttrs"
        class="w-full rounded-sm border border-neutral-200 bg-white p-2.5 text-body focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
      >
        <option value="" disabled>Choose a payment method</option>
        <option v-for="p in paymentMethodOptions" :key="p.id" :value="p.id">{{ p.name }}</option>
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

    <!-- Supplier (expense) -->
    <div v-else>
      <label class="mb-1 block text-body-sm text-neutral-700" for="tx-supplier">Supplier (optional)</label>
      <input
        id="tx-supplier"
        v-model="supplierName"
        v-bind="supplierNameAttrs"
        type="text"
        placeholder="Who was paid"
        class="w-full rounded-sm border border-neutral-200 bg-white p-2.5 text-body focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
      />
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
