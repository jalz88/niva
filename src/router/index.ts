import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

// Visibility of admin-only routes is also enforced by RLS on every
// underlying table — this meta flag only controls navigation, per
// docs/05-information-architecture.md: "Permissions must be enforced in
// data access, not merely hidden in navigation."
const adminOnly = { roles: ['administrator'] }
// Housekeeping hub/schedule/rooms/staff — same reasoning as
// recurring-payments below: staff never reaches these at all (kiosk mode,
// see AppShell.vue + the redirect below), viewer isn't in the Screen
// access sheet's eligible roles either (administration/UsersView.vue's
// SCREEN_GROUPS).
const managerOrAdmin = { roles: ['administrator', 'manager'] }

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/sign-in',
      name: 'sign-in',
      component: () => import('@/views/SignInView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
    },
    {
      path: '/transactions',
      name: 'transactions',
      component: () => import('@/views/TransactionsView.vue'),
    },
    {
      path: '/transactions/:id',
      name: 'transaction-detail',
      component: () => import('@/views/TransactionDetailView.vue'),
    },
    {
      path: '/transactions/:id/edit',
      name: 'transaction-edit',
      component: () => import('@/views/EditTransactionView.vue'),
    },
    {
      path: '/account',
      name: 'account',
      component: () => import('@/views/AccountView.vue'),
    },
    {
      path: '/reports',
      name: 'reports',
      component: () => import('@/views/ReportsView.vue'),
    },
    {
      path: '/recurring-payments',
      name: 'recurring-payments',
      component: () => import('@/views/RecurringPaymentsView.vue'),
      meta: managerOrAdmin,
    },
    {
      path: '/housekeeping',
      name: 'housekeeping',
      component: () => import('@/views/housekeeping/HubView.vue'),
      meta: managerOrAdmin,
    },
    {
      path: '/housekeeping/schedule',
      name: 'housekeeping-schedule',
      component: () => import('@/views/housekeeping/TodayView.vue'),
      meta: managerOrAdmin,
    },
    // Ungated — any authenticated workspace member reaches their own Today
    // view (RLS on workforce_members/room_assignments already allows any
    // member to read the roster/assignments, migration 0012). This is also
    // the staff/caretaker kiosk-mode landing route (see the redirect below
    // and AppShell.vue's isKiosk).
    {
      path: '/housekeeping/today',
      name: 'housekeeping-today',
      component: () => import('@/views/housekeeping/TodayView.vue'),
    },
    {
      path: '/housekeeping/rooms',
      name: 'housekeeping-rooms',
      component: () => import('@/views/housekeeping/RoomsView.vue'),
      meta: managerOrAdmin,
    },
    {
      path: '/housekeeping/staff',
      name: 'housekeeping-staff',
      component: () => import('@/views/housekeeping/StaffView.vue'),
      meta: managerOrAdmin,
    },
    {
      path: '/administration',
      name: 'administration',
      component: () => import('@/views/AdministrationView.vue'),
      meta: adminOnly,
    },
    {
      path: '/administration/properties',
      name: 'administration-properties',
      component: () => import('@/views/administration/PropertiesView.vue'),
      meta: adminOnly,
    },
    {
      path: '/administration/platforms',
      name: 'administration-platforms',
      component: () => import('@/views/administration/PlatformsView.vue'),
      meta: adminOnly,
    },
    {
      path: '/administration/payment-methods',
      name: 'administration-payment-methods',
      component: () => import('@/views/administration/PaymentMethodsView.vue'),
      meta: adminOnly,
    },
    {
      path: '/administration/categories',
      name: 'administration-categories',
      component: () => import('@/views/administration/CategoriesView.vue'),
      meta: adminOnly,
    },
    {
      path: '/administration/suppliers',
      name: 'administration-suppliers',
      component: () => import('@/views/administration/SuppliersView.vue'),
      meta: adminOnly,
    },
    {
      path: '/administration/currencies',
      name: 'administration-currencies',
      component: () => import('@/views/administration/CurrenciesView.vue'),
      meta: adminOnly,
    },
    {
      path: '/administration/users',
      name: 'administration-users',
      component: () => import('@/views/administration/UsersView.vue'),
      meta: adminOnly,
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
      meta: { public: true },
    },
  ],
})

router.beforeEach(async (to) => {
  const { isAuthenticated, role, ensureReady } = useAuth()

  // Wait for the actual session + membership lookup to resolve, rather
  // than guessing with a timer.
  await ensureReady()

  if (!to.meta.public && !isAuthenticated.value) {
    return { name: 'sign-in', query: { redirect: to.fullPath } }
  }

  if (to.meta.public && to.name === 'sign-in' && isAuthenticated.value) {
    return { name: 'dashboard' }
  }

  // Staff = housekeeping caretaker (decided 2026-08-24) — no nav chrome,
  // no other destination. Every route but their own Today view bounces
  // back there, same as AppShell.vue rendering no chrome for this role.
  // Checked ahead of the general roles check below so a staff account
  // hitting an admin/manager-only route redirects straight there in one
  // hop instead of bouncing through 'dashboard' first.
  if (!to.meta.public && role.value === 'staff' && to.name !== 'housekeeping-today') {
    return { name: 'housekeeping-today' }
  }

  const allowedRoles = to.meta.roles as string[] | undefined
  if (allowedRoles && role.value && !allowedRoles.includes(role.value)) {
    return { name: 'dashboard' }
  }

  return true
})

// Clears the reload guard below once a navigation actually succeeds, so a
// *future* deploy's chunk errors (not just the first one this tab hits)
// can still trigger the one-time reload.
router.afterEach(() => {
  sessionStorage.removeItem('niva:chunk-reload')
})

// Defensive fallback alongside the vite:preloadError listener in main.ts —
// covers dynamic-import failures that event doesn't catch. Guarded by a
// one-shot sessionStorage flag so a genuinely offline user gets a normal
// failed-navigation state instead of a reload loop.
router.onError((error) => {
  const isChunkLoadError = /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i.test(
    error.message,
  )
  if (isChunkLoadError && !sessionStorage.getItem('niva:chunk-reload')) {
    sessionStorage.setItem('niva:chunk-reload', '1')
    window.location.reload()
  }
})

export default router
