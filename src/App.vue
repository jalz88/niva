<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'
import ToastContainer from '@/components/ToastContainer.vue'
import QuickAddSheet from '@/components/transactions/QuickAddSheet.vue'

const route = useRoute()
const showChrome = computed(() => !route.meta.public)
</script>

<template>
  <AppShell v-if="showChrome" />
  <RouterView v-else />
  <ToastContainer />
  <QuickAddSheet v-if="showChrome" />
</template>
