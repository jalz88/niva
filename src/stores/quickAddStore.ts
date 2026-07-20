import { defineStore } from 'pinia'

// Client-only UI state (sheet open/closed) — Pinia per
// docs/11-coding-standards-and-test-strategy.md §2. No server data lives
// here; QuickAddSheet.vue owns the actual submit logic.
export const useQuickAddStore = defineStore('quickAdd', {
  state: () => ({
    open: false,
  }),
  actions: {
    show() {
      this.open = true
    },
    hide() {
      this.open = false
    },
  },
})
