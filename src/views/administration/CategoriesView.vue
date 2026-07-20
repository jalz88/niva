<script setup lang="ts">
import { computed, watch } from 'vue'
import AdminBackHeader from '@/components/admin/AdminBackHeader.vue'
import ConfigItemList from '@/components/admin/ConfigItemList.vue'
import { useCategories } from '@/composables/useCategories'
import { useAuth } from '@/composables/useAuth'

const { workspaceId } = useAuth()
const categories = useCategories()

watch(
  workspaceId,
  (id) => {
    if (id) categories.list(id)
  },
  { immediate: true },
)

const incomeCategories = computed(() => categories.items.value.filter((c) => c.type === 'income'))
const expenseCategories = computed(() => categories.items.value.filter((c) => c.type === 'expense'))
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 pt-6 pb-24 md:pb-8">
    <AdminBackHeader title="Categories" description="Owner-managed classifications, each fixed to income or expense." />

    <ConfigItemList
      section-title="Income categories"
      section-description="Classifications for income transactions, such as Booking payout."
      add-label="Add income category"
      name-placeholder="Category name"
      :items="incomeCategories"
      :loading="categories.loading.value"
      :error="categories.error.value"
      :create="(name) => categories.create(workspaceId!, name, 'income')"
      :rename="categories.rename"
      :set-active="categories.setActive"
    />
    <ConfigItemList
      section-title="Expense categories"
      section-description="Classifications for expense transactions, such as Utilities."
      add-label="Add expense category"
      name-placeholder="Category name"
      :items="expenseCategories"
      :loading="categories.loading.value"
      :error="categories.error.value"
      :create="(name) => categories.create(workspaceId!, name, 'expense')"
      :rename="categories.rename"
      :set-active="categories.setActive"
    />
  </div>
</template>
