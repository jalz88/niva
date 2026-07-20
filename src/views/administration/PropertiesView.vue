<script setup lang="ts">
import { watch } from 'vue'
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
  <ConfigItemList
    title="Properties"
    description="Business locations or accommodation operations, such as Kandy BnB or a future Bali villa."
    add-label="Add property"
    name-placeholder="Property name"
    :items="properties.items.value"
    :loading="properties.loading.value"
    :error="properties.error.value"
    :create="(name) => properties.create(workspaceId!, name)"
    :rename="properties.rename"
    :set-active="properties.setActive"
  />
</template>
