<script setup lang="ts">
import { watch } from 'vue'
import AdminBackHeader from '@/components/admin/AdminBackHeader.vue'
import ConfigItemList from '@/components/admin/ConfigItemList.vue'
import { useConfigItems } from '@/composables/useConfigItems'
import { useAuth } from '@/composables/useAuth'

const { workspaceId } = useAuth()
const properties = useConfigItems('properties')

watch(
  workspaceId,
  (id) => {
    if (id) properties.list(id)
  },
  { immediate: true },
)
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 pt-6 pb-24 md:pb-8">
    <AdminBackHeader
      title="Properties"
      description="Business locations or accommodation operations, such as hashtag28 or a future second property."
    />
    <ConfigItemList
      add-label="Add property"
      name-placeholder="Property name"
      :items="properties.items.value"
      :loading="properties.loading.value"
      :error="properties.error.value"
      :create="(name) => properties.create(workspaceId!, name)"
      :rename="properties.rename"
      :set-active="properties.setActive"
    />
  </div>
</template>
