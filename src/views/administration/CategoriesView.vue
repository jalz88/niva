<script setup lang="ts">
import { computed, watch } from 'vue'
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
  <div>
    <ConfigItemList
      title="Income categories"
      description="Classifications for income transactions, such as Booking payout."
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
      title="Expense categories"
      description="Classifications for expense transactions, such as Utilities."
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
