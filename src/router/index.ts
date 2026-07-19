import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

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
      path: '/reports',
      name: 'reports',
      component: () => import('@/views/ReportsView.vue'),
    },
    {
      path: '/administration',
      name: 'administration',
      component: () => import('@/views/AdministrationView.vue'),
      // Visibility is also enforced by RLS on every underlying table — this
      // meta flag only controls navigation, per
      // docs/05-information-architecture.md "Permissions must be enforced
      // in data access, not merely hidden in navigation."
      meta: { roles: ['administrator'] },
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
  const { isAuthenticated, role } = useAuth()

  // useAuth() calls init() synchronously but session restoration is async;
  // give it a tick to resolve on first navigation.
  await new Promise((resolve) => setTimeout(resolve, 0))

  if (!to.meta.public && !isAuthenticated.value) {
    return { name: 'sign-in', query: { redirect: to.fullPath } }
  }

  if (to.meta.public && to.name === 'sign-in' && isAuthenticated.value) {
    return { name: 'dashboard' }
  }

  const allowedRoles = to.meta.roles as string[] | undefined
  if (allowedRoles && role.value && !allowedRoles.includes(role.value)) {
    return { name: 'dashboard' }
  }

  return true
})

export default router
