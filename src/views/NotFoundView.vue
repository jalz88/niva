<template>
  <div class="flex min-h-screen flex-col items-center justify-center gap-2 bg-neutral-50 px-4 text-center">
    <h1 class="text-h1 font-semibold text-neutral-900">Page not found</h1>
    <RouterLink :to="{ name: 'dashboard' }" class="text-body text-accent-600 hover:underline">
      Back to Dashboard
    </RouterLink>
  </div>
</template>
