<script setup lang="ts">
import { watch } from 'vue'
import AdminBackHeader from '@/components/admin/AdminBackHeader.vue'
import ConfigItemList from '@/components/admin/ConfigItemList.vue'
import { useConfigItems } from '@/composables/useConfigItems'
import { useAuth } from '@/composables/useAuth'

const { workspaceId } = useAuth()
const suppliers = useConfigItems('suppliers')

watch(
  workspaceId,
  (id) => {
    if (id) suppliers.list(id)
  },
  { immediate: true },
)
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 pt-6 pb-24 md:pb-8">
    <AdminBackHeader
      title="Suppliers"
      description="Who expenses get paid to. Anyone recording an expense can also add a new supplier on the spot — this is just where they get managed."
    />
    <ConfigItemList
      add-label="Add supplier"
      name-placeholder="Supplier name"
      :items="suppliers.items.value"
      :loading="suppliers.loading.value"
      :error="suppliers.error.value"
      :create="(name) => suppliers.create(workspaceId!, name)"
      :rename="suppliers.rename"
      :set-active="suppliers.setActive"
    />
  </div>
</template>
