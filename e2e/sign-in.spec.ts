import { test, expect } from '@playwright/test'

// Runs against the real Supabase project (see docs/11-coding-standards-and-test-strategy.md
// §7) using a dedicated, RLS-isolated "NIVA E2E Test" workspace and a
// dedicated test account — never Jalie's real workspace or credentials.
// Set E2E_TEST_EMAIL / E2E_TEST_PASSWORD locally to run this; CI supplies
// them from repository secrets.
const email = process.env.E2E_TEST_EMAIL
const password = process.env.E2E_TEST_PASSWORD

// Fails loudly rather than silently skipping — CI always has these secrets
// configured, so a missing value here means the workflow itself is
// misconfigured and should be visible, not swallowed.
test.beforeAll(() => {
  if (!email || !password) {
    throw new Error('E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set — see docs/11-coding-standards-and-test-strategy.md §7')
  }
})

test('signs in and lands on the dashboard without a manual reload', async ({ page }) => {
  await page.goto('/sign-in')

  await page.getByLabel('Email').fill(email!)
  await page.getByLabel('Password').fill(password!)
  await page.getByRole('button', { name: 'Sign in' }).click()

  // Regression coverage for the async auth-state race fixed in useAuth.signIn()
  // (2026-07-21): before that fix, the router guard's redirect could run
  // before the onAuthStateChange listener updated session/role state, so
  // sign-in silently failed to navigate until a manual page reload. This
  // must resolve on its own, with no reload anywhere in this test.
  await expect(page).toHaveURL('/', { timeout: 10000 })
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})

test('shows an inline error for wrong credentials, without navigating', async ({ page }) => {
  await page.goto('/sign-in')

  await page.getByLabel('Email').fill(email ?? 'nobody@example.com')
  await page.getByLabel('Password').fill('definitely-the-wrong-password')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page).toHaveURL('/sign-in')
})
