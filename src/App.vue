<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'

const route = useRoute()
const showChrome = computed(() => !route.meta.public)
</script>

<template>
  <AppShell v-if="showChrome" />
  <RouterView v-else />
</template>
