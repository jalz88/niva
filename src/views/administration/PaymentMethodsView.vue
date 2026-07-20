<script setup lang="ts">
import { watch } from 'vue'
import ConfigItemList from '@/components/admin/ConfigItemList.vue'
import { useConfigItems } from '@/composables/useConfigItems'
import { useAuth } from '@/composables/useAuth'

const { workspaceId } = useAuth()
const paymentMethods = useConfigItems('payment_methods')

watch(
  workspaceId,
  (id) => {
    if (id) paymentMethods.list(id)
  },
  { immediate: true },
)
</script>

<template>
  <ConfigItemList
    title="Payment methods"
    description="How money was received or paid, such as cash, bank transfer, or card."
    add-label="Add payment method"
    name-placeholder="Payment method name"
    :items="paymentMethods.items.value"
    :loading="paymentMethods.loading.value"
    :error="paymentMethods.error.value"
    :create="(name) => paymentMethods.create(workspaceId!, name)"
    :rename="paymentMethods.rename"
    :set-active="paymentMethods.setActive"
  />
</template>
