import type { Page } from '@playwright/test'

// Shared by every spec file. See e2e/sign-in.spec.ts for the rationale on
// why this fails loudly instead of skipping when unset.
export function testCredentials(): { email: string; password: string } {
  const email = process.env.E2E_TEST_EMAIL
  const password = process.env.E2E_TEST_PASSWORD
  if (!email || !password) {
    throw new Error('E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set — see docs/11-coding-standards-and-test-strategy.md §7')
  }
  return { email, password }
}

// Used by every spec that needs to already be signed in to test something
// else (Quick Add, edit, delete, ...) — e2e/sign-in.spec.ts tests this flow
// directly instead of calling this helper.
export async function signIn(page: Page): Promise<void> {
  const { email, password } = testCredentials()
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('/')
}
