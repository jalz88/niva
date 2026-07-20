<script setup lang="ts">
import { computed, watch } from 'vue'
import AdminBackHeader from '@/components/admin/AdminBackHeader.vue'
import ConfigItemList from '@/components/admin/ConfigItemList.vue'
import { useCategories, topLevelCategories, subcategoriesOf } from '@/composables/useCategories'
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

const incomeCategories = computed(() => topLevelCategories(categories.items.value, 'income'))
const expenseCategories = computed(() => topLevelCategories(categories.items.value, 'expense'))

function childrenOf(categoryId: string) {
  return subcategoriesOf(categories.items.value, categoryId)
}
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 pt-6 pb-24 md:pb-8">
    <AdminBackHeader
      title="Categories"
      description="Owner-managed classifications, each fixed to income or expense. Star up to 3 as favorites — they show as quick-tap buttons on the transaction form."
    />

    <ConfigItemList
      section-title="Income categories"
      section-description="Classifications for income transactions, such as Airbnb payout."
      add-label="Add income category"
      name-placeholder="Category name"
      :items="incomeCategories"
      :loading="categories.loading.value"
      :error="categories.error.value"
      :create="(name) => categories.create(workspaceId!, name, 'income')"
      :rename="categories.rename"
      :set-active="categories.setActive"
      :set-favorite="categories.setFavorite"
    >
      <template #row-extra="{ item }">
        <details class="mt-2 pl-1">
          <summary class="cursor-pointer text-caption font-medium text-neutral-500">
            Sub-categories{{ childrenOf(item.id).length ? ` (${childrenOf(item.id).length})` : '' }}
          </summary>
          <div class="mt-2 pl-3">
            <ConfigItemList
              compact
              :add-label="`Add sub-category under ${item.name}`"
              name-placeholder="Sub-category name"
              :items="childrenOf(item.id)"
              :loading="false"
              :error="null"
              :create="(name) => categories.createSubcategory(workspaceId!, name, item.id)"
              :rename="categories.rename"
              :set-active="categories.setActive"
            />
          </div>
        </details>
      </template>
    </ConfigItemList>

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
      :set-favorite="categories.setFavorite"
    >
      <template #row-extra="{ item }">
        <details class="mt-2 pl-1">
          <summary class="cursor-pointer text-caption font-medium text-neutral-500">
            Sub-categories{{ childrenOf(item.id).length ? ` (${childrenOf(item.id).length})` : '' }}
          </summary>
          <div class="mt-2 pl-3">
            <ConfigItemList
              compact
              :add-label="`Add sub-category under ${item.name}`"
              name-placeholder="Sub-category name"
              :items="childrenOf(item.id)"
              :loading="false"
              :error="null"
              :create="(name) => categories.createSubcategory(workspaceId!, name, item.id)"
              :rename="categories.rename"
              :set-active="categories.setActive"
            />
          </div>
        </details>
      </template>
    </ConfigItemList>
  </div>
</template>
