import { defineStore } from 'pinia'

export interface Toast {
  id: string
  message: string
  tone: 'success' | 'error' | 'info'
  actionLabel?: string
  onAction?: () => void
}

interface ShowOptions {
  tone?: Toast['tone']
  actionLabel?: string
  onAction?: () => void
  durationMs?: number
}

// Client-only UI state — a natural fit for Pinia per
// docs/11-coding-standards-and-test-strategy.md §2.
export const useToastStore = defineStore('toast', {
  state: () => ({
    toasts: [] as Toast[],
  }),
  actions: {
    show(message: string, options: ShowOptions = {}): string {
      const id = crypto.randomUUID()
      this.toasts.push({
        id,
        message,
        tone: options.tone ?? 'success',
        actionLabel: options.actionLabel,
        onAction: options.onAction,
      })
      const duration = options.durationMs ?? (options.actionLabel ? 6000 : 4000)
      setTimeout(() => this.dismiss(id), duration)
      return id
    },
    dismiss(id: string) {
      this.toasts = this.toasts.filter((t) => t.id !== id)
    },
  },
})
