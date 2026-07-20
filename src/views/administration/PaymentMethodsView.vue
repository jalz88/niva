<script setup lang="ts">
import { watch } from 'vue'
import AdminBackHeader from '@/components/admin/AdminBackHeader.vue'
import ConfigItemList from '@/components/admin/ConfigItemList.vue'
import { usePaymentMethods } from '@/composables/usePaymentMethods'
import { useAuth } from '@/composables/useAuth'

const { workspaceId } = useAuth()
const paymentMethods = usePaymentMethods()

watch(
  workspaceId,
  (id) => {
    if (id) paymentMethods.list(id)
  },
  { immediate: true },
)
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 pt-6 pb-24 md:pb-8">
    <AdminBackHeader
      title="Payment methods"
      description="How money was received or paid, such as cash, bank transfer, or card. Star up to 3 as favorites — they show as quick-tap buttons on the transaction form."
    />
    <ConfigItemList
      add-label="Add payment method"
      name-placeholder="Payment method name"
      :items="paymentMethods.items.value"
      :loading="paymentMethods.loading.value"
      :error="paymentMethods.error.value"
      :create="(name) => paymentMethods.create(workspaceId!, name)"
      :rename="paymentMethods.rename"
      :set-active="paymentMethods.setActive"
      :set-favorite="paymentMethods.setFavorite"
    />
  </div>
</template>
