import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { toNivaError, type NivaError } from '@/lib/errors'
import type { HousekeepingCompletionDay, HousekeepingAttentionRoom } from '@/types/database'

export interface CompletionDay {
  date: string
  tasksDue: number
  tasksCompleted: number
  tasksOnTime: number
  tasksLate: number
}

export interface AttentionRoom {
  roomId: string
  roomName: string
  tasksOverdue: number
  lastCompletedAt: string | null
  lastInspectedAt: string | null
}

export interface TodaySummary {
  done: number
  total: number
  pct: number
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

// Backs the Dashboard glance line, the Reports "Housekeeping" trend, and
// its "Areas needing attention" list — all three read from
// housekeeping_completion_summary / housekeeping_attention_rooms
// (migration 0012) rather than aggregating raw completions client-side,
// same reasoning as useReports.ts for the financial reports.
export function useHousekeepingReports() {
  const today = ref<TodaySummary | null>(null)
  const completionByDay = ref<CompletionDay[]>([])
  const attentionRooms = ref<AttentionRoom[]>([])
  const loading = ref(false)
  const error = ref<NivaError | null>(null)

  function mapDays(rows: HousekeepingCompletionDay[]): CompletionDay[] {
    return rows.map((r) => ({
      date: r.report_date,
      tasksDue: r.tasks_due,
      tasksCompleted: r.tasks_completed,
      tasksOnTime: r.tasks_on_time,
      tasksLate: r.tasks_late,
    }))
  }

  // Dashboard's single-glance line — today's row only.
  async function loadToday(workspaceId: string) {
    loading.value = true
    error.value = null
    const d = todayIso()

    const { data, error: dbError } = await supabase.rpc('housekeeping_completion_summary', {
      p_workspace_id: workspaceId,
      p_period_start: d,
      p_period_end: d,
    })

    loading.value = false
    if (dbError) {
      error.value = toNivaError(dbError)
      return
    }
    const row = mapDays((data ?? []) as HousekeepingCompletionDay[])[0]
    today.value = row
      ? { done: row.tasksCompleted, total: row.tasksDue, pct: row.tasksDue ? Math.round((row.tasksCompleted / row.tasksDue) * 100) : 100 }
      : { done: 0, total: 0, pct: 100 }
  }

  // Reports' trend chart — a day-by-day range.
  async function loadTrend(workspaceId: string, dateFrom: string, dateTo: string) {
    loading.value = true
    error.value = null

    const { data, error: dbError } = await supabase.rpc('housekeeping_completion_summary', {
      p_workspace_id: workspaceId,
      p_period_start: dateFrom,
      p_period_end: dateTo,
    })

    loading.value = false
    if (dbError) {
      error.value = toNivaError(dbError)
      return
    }
    completionByDay.value = mapDays((data ?? []) as HousekeepingCompletionDay[])
  }

  // Reports' "Areas needing attention" list.
  async function loadAttentionRooms(workspaceId: string) {
    loading.value = true
    error.value = null

    const { data, error: dbError } = await supabase.rpc('housekeeping_attention_rooms', { p_workspace_id: workspaceId })

    loading.value = false
    if (dbError) {
      error.value = toNivaError(dbError)
      return
    }
    attentionRooms.value = ((data ?? []) as HousekeepingAttentionRoom[]).map((r) => ({
      roomId: r.room_id,
      roomName: r.room_name,
      tasksOverdue: r.tasks_overdue,
      lastCompletedAt: r.last_completed_at,
      lastInspectedAt: r.last_inspected_at,
    }))
  }

  return { today, completionByDay, attentionRooms, loading, error, loadToday, loadTrend, loadAttentionRooms }
}
