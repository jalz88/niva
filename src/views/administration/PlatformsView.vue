<script setup lang="ts">
import { watch } from 'vue'
import AdminBackHeader from '@/components/admin/AdminBackHeader.vue'
import ConfigItemList from '@/components/admin/ConfigItemList.vue'
import { useConfigItems } from '@/composables/useConfigItems'
import { useAuth } from '@/composables/useAuth'

const { workspaceId } = useAuth()
const platforms = useConfigItems('platforms')

watch(
  workspaceId,
  (id) => {
    if (id) platforms.list(id)
  },
  { immediate: true },
)
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 pt-6 pb-24 md:pb-8">
    <AdminBackHeader
      title="Platforms"
      description="Revenue sources or sales channels, such as Airbnb or Agoda. Optional on expense transactions."
    />
    <ConfigItemList
      add-label="Add platform"
      name-placeholder="Platform name"
      :items="platforms.items.value"
      :loading="platforms.loading.value"
      :error="platforms.error.value"
      :create="(name) => platforms.create(workspaceId!, name)"
      :rename="platforms.rename"
      :set-active="platforms.setActive"
    />
  </div>
</template>
