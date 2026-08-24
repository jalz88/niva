<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { useAuth } from '@/composables/useAuth'
import { useConfigItems } from '@/composables/useConfigItems'
import { useRooms, type RoomPayload } from '@/composables/useRooms'
import { useSopTasks, type SopTaskPayload } from '@/composables/useSopTasks'
import { useToastStore } from '@/stores/toastStore'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import type { NivaError } from '@/lib/errors'
import type { Room, RoomType, SopTask, SopCadenceType } from '@/types/database'

const { workspaceId } = useAuth()
const properties = useConfigItems('properties')
const { items: rooms, loading, error, revision: roomsRevision, list, create: createRoom, update: updateRoom, archive: archiveRoom, syncIcal } = useRooms()
const { items: tasks, revision: tasksRevision, list: listTasks, create: createTask, update: updateTask, archive: archiveTask } = useSopTasks()
const toast = useToastStore()

const activePropertyId = computed(() => properties.items.value.find((p) => p.is_active)?.id ?? '')

watch(
  workspaceId,
  (id) => {
    if (!id) return
    properties.list(id)
    list(id)
  },
  { immediate: true },
)
watch(roomsRevision, () => {
  if (workspaceId.value) list(workspaceId.value)
})

// ---- List / detail (no separate route — see composable/view notes) -------

const selectedRoomId = ref<string | null>(null)
const selectedRoom = computed(() => rooms.value.find((r) => r.id === selectedRoomId.value) ?? null)

function openRoom(room: Room) {
  selectedRoomId.value = room.id
  syncResult.value = null
  listTasks(room.id)
}
function backToList() {
  selectedRoomId.value = null
}
watch(tasksRevision, () => {
  if (selectedRoomId.value) listTasks(selectedRoomId.value)
})

// ---- Manual iCal sync (2026-08-24) — "test my URL right now," ahead of
// the daily automatic sync (docs §11, not built yet). ------------------

const syncing = ref(false)
const syncResult = ref<{ ok: boolean; eventCount?: number; error?: string } | null>(null)

async function onSyncNow() {
  if (!selectedRoom.value || !workspaceId.value) return
  syncing.value = true
  syncResult.value = null
  const result = await syncIcal(selectedRoom.value.id, workspaceId.value)
  syncing.value = false
  syncResult.value = result
  if (!result.ok) toast.show(result.error || 'Sync failed.', { tone: 'error' })
}

const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  bedroom: 'Bedroom',
  bathroom: 'Bathroom',
  common_area: 'Common area',
  outdoor: 'Outdoor',
}
const CADENCE_LABELS: Record<SopCadenceType, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
}
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ---- Add/Edit room sheet ---------------------------------------------------

const showRoomForm = ref(false)
const editingRoomId = ref<string | null>(null)
const formName = ref('')
const formRoomType = ref<RoomType>('bedroom')
const formLinked = ref(false)
const formIcalUrl = ref('')
const submitting = ref(false)
const submitError = ref<NivaError | null>(null)

function openAddRoom() {
  editingRoomId.value = null
  formName.value = ''
  formRoomType.value = 'bedroom'
  formLinked.value = false
  formIcalUrl.value = ''
  submitError.value = null
  showRoomForm.value = true
}
function openEditRoom(room: Room) {
  editingRoomId.value = room.id
  formName.value = room.name
  formRoomType.value = room.room_type
  formLinked.value = room.linked_to_bookings
  formIcalUrl.value = room.ical_url ?? ''
  submitError.value = null
  showRoomForm.value = true
}

async function submitRoomForm() {
  if (!workspaceId.value) return
  if (!activePropertyId.value) {
    submitError.value = { code: 'validation_error', message: 'No active property found for this workspace.', retryable: false }
    return
  }
  if (!formName.value.trim()) {
    submitError.value = { code: 'validation_error', message: 'Give the room a name.', retryable: false }
    return
  }

  const payload: RoomPayload = {
    propertyId: activePropertyId.value,
    name: formName.value.trim(),
    roomType: formRoomType.value,
    linkedToBookings: formLinked.value,
    icalUrl: formIcalUrl.value.trim() || null,
  }

  submitting.value = true
  submitError.value = null
  const err = editingRoomId.value
    ? await updateRoom(editingRoomId.value, workspaceId.value, payload)
    : await createRoom(workspaceId.value, payload)
  submitting.value = false

  if (err) {
    submitError.value = err
    return
  }
  toast.show(editingRoomId.value ? 'Room updated.' : 'Room added.')
  showRoomForm.value = false
}

const pendingArchiveRoom = ref<Room | null>(null)
function requestArchiveRoom() {
  if (!editingRoomId.value) return
  pendingArchiveRoom.value = rooms.value.find((r) => r.id === editingRoomId.value) ?? null
  showRoomForm.value = false
}
async function confirmArchiveRoom() {
  if (!pendingArchiveRoom.value || !workspaceId.value) return
  const err = await archiveRoom(pendingArchiveRoom.value.id, workspaceId.value)
  if (err) {
    toast.show(err.message, { tone: 'error' })
  } else {
    toast.show('Room removed.')
    if (selectedRoomId.value === pendingArchiveRoom.value.id) selectedRoomId.value = null
  }
  pendingArchiveRoom.value = null
}

// ---- Add/Edit task sheet ---------------------------------------------------

const showTaskForm = ref(false)
const editingTaskId = ref<string | null>(null)
const taskName = ref('')
const taskCadence = ref<SopCadenceType>('daily')
const taskDayOfWeek = ref(1)
const taskDayOfMonth = ref(1)
const taskSubmitting = ref(false)
const taskSubmitError = ref<NivaError | null>(null)

function openAddTask() {
  editingTaskId.value = null
  taskName.value = ''
  taskCadence.value = 'daily'
  taskDayOfWeek.value = 1
  taskDayOfMonth.value = 1
  taskSubmitError.value = null
  showTaskForm.value = true
}
function openEditTask(task: SopTask) {
  editingTaskId.value = task.id
  taskName.value = task.name
  taskCadence.value = task.cadence_type
  taskDayOfWeek.value = task.cadence_day_of_week ?? 1
  taskDayOfMonth.value = task.cadence_day_of_month ?? 1
  taskSubmitError.value = null
  showTaskForm.value = true
}

async function submitTaskForm() {
  if (!workspaceId.value || !selectedRoomId.value) return
  if (!taskName.value.trim()) {
    taskSubmitError.value = { code: 'validation_error', message: 'Give the task a name.', retryable: false }
    return
  }

  const payload: SopTaskPayload = {
    name: taskName.value.trim(),
    cadenceType: taskCadence.value,
    cadenceDayOfWeek: taskCadence.value === 'weekly' ? taskDayOfWeek.value : null,
    cadenceDayOfMonth: taskCadence.value === 'monthly' || taskCadence.value === 'quarterly' ? taskDayOfMonth.value : null,
  }

  taskSubmitting.value = true
  taskSubmitError.value = null
  const err = editingTaskId.value
    ? await updateTask(editingTaskId.value, selectedRoomId.value, payload)
    : await createTask(workspaceId.value, selectedRoomId.value, payload)
  taskSubmitting.value = false

  if (err) {
    taskSubmitError.value = err
    return
  }
  toast.show(editingTaskId.value ? 'Task updated.' : 'Task added.')
  showTaskForm.value = false
}

const pendingArchiveTask = ref<SopTask | null>(null)
function requestArchiveTask() {
  if (!editingTaskId.value) return
  pendingArchiveTask.value = tasks.value.find((t) => t.id === editingTaskId.value) ?? null
  showTaskForm.value = false
}
async function confirmArchiveTask() {
  if (!pendingArchiveTask.value || !selectedRoomId.value) return
  const err = await archiveTask(pendingArchiveTask.value.id, selectedRoomId.value)
  if (err) toast.show(err.message, { tone: 'error' })
  else toast.show('Task removed.')
  pendingArchiveTask.value = null
}
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pt-6 pb-24 md:pb-8">
    <!-- Room list -->
    <template v-if="!selectedRoom">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <RouterLink :to="{ name: 'housekeeping' }" class="mb-2 inline-flex items-center gap-1 text-body-sm font-medium text-neutral-500 hover:text-accent-600">
            <ChevronLeft :size="16" />
            Housekeeping
          </RouterLink>
          <h1 class="text-h1 font-semibold text-neutral-900">Rooms</h1>
          <p class="text-body-sm text-neutral-500">Spaces, cleaning checklists, booking sync.</p>
        </div>
        <button type="button" class="flex items-center gap-1.5 rounded-pill bg-white px-4 py-2 text-body-sm font-medium text-neutral-700 shadow-sm" @click="openAddRoom">
          <Plus :size="16" />
          Add
        </button>
      </div>

      <div v-if="loading && !rooms.length" class="flex flex-col gap-2">
        <div v-for="i in 3" :key="i" class="h-16 animate-pulse rounded-md bg-neutral-100" />
      </div>
      <div v-else-if="error" class="flex items-center justify-between gap-3 rounded-md bg-negative-600/5 p-4 text-body-sm text-negative-600">
        <span>{{ error.message }}</span>
        <button type="button" class="font-medium underline" @click="workspaceId && list(workspaceId)">Try again</button>
      </div>
      <section v-else-if="!rooms.length" class="rounded-md bg-white p-6 text-center shadow-sm">
        <h2 class="mb-1 text-h3 font-semibold text-neutral-900">No rooms yet</h2>
        <p class="mb-4 text-body-sm text-neutral-500">Add your first room to build its cleaning checklist.</p>
        <button type="button" class="rounded-sm bg-accent-500 px-4 py-2 text-body-sm font-medium text-white hover:bg-accent-600" @click="openAddRoom">Add room</button>
      </section>
      <div v-else class="flex flex-col gap-2">
        <div
          v-for="room in rooms"
          :key="room.id"
          class="flex cursor-pointer items-center justify-between gap-3 rounded-md bg-white p-4 shadow-sm hover:shadow-md"
          :class="{ 'opacity-50': !room.is_active }"
          @click="openRoom(room)"
        >
          <div class="min-w-0">
            <p class="truncate text-body font-semibold text-neutral-900">{{ room.name }}</p>
            <p class="truncate text-caption text-neutral-500">
              {{ ROOM_TYPE_LABELS[room.room_type] }}<span v-if="room.linked_to_bookings"> · Booking-linked</span>
            </p>
          </div>
          <ChevronRight :size="18" class="shrink-0 text-neutral-400" />
        </div>
      </div>
    </template>

    <!-- Room detail -->
    <template v-else>
      <div class="mb-4">
        <button type="button" class="mb-2 inline-flex items-center gap-1 text-body-sm font-medium text-neutral-500 hover:text-accent-600" @click="backToList">
          <ChevronLeft :size="16" />
          Rooms
        </button>
        <div class="flex items-start justify-between gap-3">
          <div>
            <h1 class="text-h1 font-semibold text-neutral-900">{{ selectedRoom.name }}</h1>
            <p class="text-body-sm text-neutral-500">{{ ROOM_TYPE_LABELS[selectedRoom.room_type] }}</p>
          </div>
          <button type="button" class="rounded-pill bg-white px-4 py-2 text-body-sm font-medium text-neutral-700 shadow-sm" @click="openEditRoom(selectedRoom)">Edit</button>
        </div>
      </div>

      <div v-if="selectedRoom.linked_to_bookings" class="mb-4 rounded-md bg-white p-4 shadow-sm">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-body-sm font-semibold text-neutral-900">Booking sync</p>
            <p class="text-caption text-neutral-500">
              <span v-if="selectedRoom.ical_last_synced_at">
                Last checked {{ new Date(selectedRoom.ical_last_synced_at).toLocaleString() }}
                <span v-if="selectedRoom.ical_sync_status === 'error'" class="font-medium text-negative-600">— failed</span>
                <span v-else class="font-medium text-positive-600">— OK</span>
              </span>
              <span v-else>Not synced yet.</span>
              No automatic daily sync is set up yet — use Sync now to test the URL.
            </p>
          </div>
          <button
            type="button"
            :disabled="syncing"
            class="shrink-0 rounded-pill bg-neutral-100 px-3.5 py-2 text-caption font-medium text-neutral-700 hover:bg-neutral-200 disabled:opacity-60"
            @click="onSyncNow"
          >
            {{ syncing ? 'Syncing…' : 'Sync now' }}
          </button>
        </div>
        <p v-if="syncResult?.ok" class="mt-2 text-caption text-positive-600">
          Synced — found {{ syncResult.eventCount }} booking{{ syncResult.eventCount === 1 ? '' : 's' }} in the calendar.
        </p>
        <p v-else-if="syncResult && !syncResult.ok" class="mt-2 text-caption text-negative-600">{{ syncResult.error }}</p>
      </div>

      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-h3 font-semibold text-neutral-900">Cleaning checklist</h2>
        <button type="button" class="flex items-center gap-1.5 rounded-pill bg-white px-3.5 py-2 text-caption font-medium text-neutral-700 shadow-sm" @click="openAddTask">
          <Plus :size="14" />
          Add task
        </button>
      </div>

      <section v-if="!tasks.length" class="rounded-md bg-white p-5 text-center shadow-sm">
        <p class="text-body-sm text-neutral-500">No tasks yet — add what needs doing in this room.</p>
      </section>
      <div v-else class="flex flex-col gap-2">
        <div v-for="task in tasks" :key="task.id" class="flex cursor-pointer items-center justify-between gap-3 rounded-md bg-white p-3.5 shadow-sm hover:shadow-md" @click="openEditTask(task)">
          <p class="truncate text-body-sm font-medium text-neutral-900">{{ task.name }}</p>
          <span class="shrink-0 rounded-pill bg-neutral-100 px-2.5 py-1 text-caption font-semibold text-neutral-500">{{ CADENCE_LABELS[task.cadence_type] }}</span>
        </div>
      </div>
    </template>

    <!-- Add/Edit room sheet -->
    <BottomSheet :open="showRoomForm" :title="editingRoomId ? 'Edit room' : 'Add room'" @close="showRoomForm = false">
      <form class="flex flex-col" @submit.prevent="submitRoomForm">
        <div class="mb-4">
          <p class="mb-2 text-body-sm text-neutral-500">Name</p>
          <input v-model="formName" type="text" placeholder="Room 1, Garden…" class="w-full rounded-md bg-white px-3.5 py-3 text-body text-neutral-900 shadow-sm outline-none placeholder:text-neutral-400" />
        </div>
        <div class="mb-4">
          <p class="mb-2 text-body-sm text-neutral-500">Type</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="(label, value) in ROOM_TYPE_LABELS"
              :key="value"
              type="button"
              class="rounded-pill px-4 py-2.5 text-body-sm"
              :class="formRoomType === value ? 'bg-accent-100 font-semibold text-accent-700 shadow-none' : 'bg-white font-medium text-neutral-700 shadow-sm'"
              @click="formRoomType = value as RoomType"
            >
              {{ label }}
            </button>
          </div>
        </div>
        <div class="mb-4 flex items-center justify-between rounded-md bg-white p-3.5 shadow-sm">
          <div>
            <p class="text-body-sm font-medium text-neutral-900">Linked to bookings</p>
            <p class="text-caption text-neutral-500">For a room guests actually book.</p>
          </div>
          <button
            type="button"
            role="switch"
            :aria-checked="formLinked"
            class="h-6 w-10 shrink-0 rounded-pill transition-colors"
            :class="formLinked ? 'bg-accent-500' : 'bg-neutral-300'"
            @click="formLinked = !formLinked"
          >
            <span class="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform" :class="{ 'translate-x-[18px]': formLinked }" />
          </button>
        </div>
        <div v-if="formLinked" class="mb-4">
          <p class="mb-2 text-body-sm text-neutral-500">Calendar export URL</p>
          <input
            v-model="formIcalUrl"
            type="text"
            placeholder="https://www.airbnb.com/calendar/ical/…"
            class="w-full rounded-md bg-white px-3.5 py-3 text-body text-neutral-900 shadow-sm outline-none placeholder:text-neutral-400"
          />
          <p class="mt-2 text-caption text-neutral-400">Checked once a day, around 1:00 AM property-local time. Read-only.</p>
        </div>

        <p v-if="submitError" class="mt-1 text-caption text-negative-600">{{ submitError.message }}</p>

        <button type="submit" :disabled="submitting" class="mt-4 rounded-lg bg-accent-500 py-3.5 text-body font-semibold text-white hover:bg-accent-600 disabled:opacity-60">
          {{ submitting ? 'Saving…' : 'Save room' }}
        </button>
        <button
          v-if="editingRoomId"
          type="button"
          class="mt-2.5 rounded-lg border border-negative-600/30 py-3 text-body-sm font-semibold text-negative-600 hover:bg-negative-600/5"
          @click="requestArchiveRoom"
        >
          Remove this room
        </button>
      </form>
    </BottomSheet>

    <!-- Add/Edit task sheet -->
    <BottomSheet :open="showTaskForm" :title="editingTaskId ? 'Edit task' : 'Add task'" @close="showTaskForm = false">
      <form class="flex flex-col" @submit.prevent="submitTaskForm">
        <div class="mb-4">
          <p class="mb-2 text-body-sm text-neutral-500">Task</p>
          <input v-model="taskName" type="text" placeholder="Remove & replace linen…" class="w-full rounded-md bg-white px-3.5 py-3 text-body text-neutral-900 shadow-sm outline-none placeholder:text-neutral-400" />
        </div>
        <div class="mb-4">
          <p class="mb-2 text-body-sm text-neutral-500">Repeats</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="(label, value) in CADENCE_LABELS"
              :key="value"
              type="button"
              class="rounded-pill px-4 py-2.5 text-body-sm"
              :class="taskCadence === value ? 'bg-accent-100 font-semibold text-accent-700 shadow-none' : 'bg-white font-medium text-neutral-700 shadow-sm'"
              @click="taskCadence = value as SopCadenceType"
            >
              {{ label }}
            </button>
          </div>
        </div>
        <div v-if="taskCadence === 'weekly'" class="mb-4 flex flex-wrap gap-2">
          <button
            v-for="(day, idx) in WEEKDAY_SHORT"
            :key="day"
            type="button"
            class="rounded-pill px-3 py-1.5 text-caption"
            :class="taskDayOfWeek === idx ? 'bg-accent-100 font-semibold text-accent-700' : 'bg-neutral-50 font-medium text-neutral-500'"
            @click="taskDayOfWeek = idx"
          >
            {{ day }}
          </button>
        </div>
        <div v-if="taskCadence === 'monthly' || taskCadence === 'quarterly'" class="mb-4 flex items-center justify-between rounded-md bg-white p-3.5 shadow-sm">
          <span class="text-body-sm text-neutral-500">On day</span>
          <input v-model.number="taskDayOfMonth" type="number" min="1" max="31" class="w-16 border-0 bg-transparent text-right text-body font-semibold text-neutral-900 outline-none" />
        </div>

        <p v-if="taskSubmitError" class="mt-1 text-caption text-negative-600">{{ taskSubmitError.message }}</p>

        <button type="submit" :disabled="taskSubmitting" class="mt-4 rounded-lg bg-accent-500 py-3.5 text-body font-semibold text-white hover:bg-accent-600 disabled:opacity-60">
          {{ taskSubmitting ? 'Saving…' : 'Save task' }}
        </button>
        <button
          v-if="editingTaskId"
          type="button"
          class="mt-2.5 rounded-lg border border-negative-600/30 py-3 text-body-sm font-semibold text-negative-600 hover:bg-negative-600/5"
          @click="requestArchiveTask"
        >
          Delete this task
        </button>
      </form>
    </BottomSheet>

    <ConfirmDialog
      :open="!!pendingArchiveRoom"
      title="Remove this room?"
      :description="pendingArchiveRoom ? `&quot;${pendingArchiveRoom.name}&quot; and its checklist will stop appearing in Today's schedule. Past history is kept.` : ''"
      confirm-label="Remove"
      danger
      @confirm="confirmArchiveRoom"
      @cancel="pendingArchiveRoom = null"
    />
    <ConfirmDialog
      :open="!!pendingArchiveTask"
      title="Delete this task?"
      :description="pendingArchiveTask ? `&quot;${pendingArchiveTask.name}&quot; will stop appearing on the checklist. Past completions are kept.` : ''"
      confirm-label="Delete"
      danger
      @confirm="confirmArchiveTask"
      @cancel="pendingArchiveTask = null"
    />
  </div>
</template>
