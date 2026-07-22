import { test, expect, type Page } from '@playwright/test'
import { signIn } from './helpers'

// Exercises the core money-recording flows against the isolated
// "NIVA E2E Test" workspace — see e2e/sign-in.spec.ts and
// docs/11-coding-standards-and-test-strategy.md §7 for why this is safe to
// run against the real Supabase project. Uses the "E2E Income"/"E2E
// Expense" categories and "E2E Cash" payment method seeded for that
// workspace (see 00-project-blueprint.md §10, 2026-07-22).
//
// Each test creates its own transaction rather than depending on another
// test's state, so retries and re-runs stay safe — this does mean the test
// workspace accumulates transactions over time, which is an accepted
// tradeoff for now (nothing reads or reports on that data outside this
// suite) and not yet worth a cleanup step.

async function openQuickAdd(page: Page) {
  await page.getByRole('button', { name: 'Add transaction' }).click()
  await expect(page.getByRole('heading', { name: 'Add transaction' })).toBeVisible()
}

async function fillAndSubmit(
  page: Page,
  opts: { type: 'income' | 'expense'; amount: string; categoryLabel: string; paymentLabel: string },
) {
  await page.getByRole('button', { name: opts.type === 'income' ? 'Income' : 'Expense', exact: true }).click()
  await page.getByLabel('Amount').fill(opts.amount)
  await page.getByLabel('Category').selectOption({ label: opts.categoryLabel })
  await page.getByLabel('Payment method').selectOption({ label: opts.paymentLabel })
  await page.getByRole('button', { name: opts.type === 'income' ? 'Save income' : 'Save expense' }).click()
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
})

test('adding an income transaction updates the dashboard without a reload', async ({ page }) => {
  // Already on the dashboard after sign-in (see helpers.signIn).
  const amount = '111.11'
  await openQuickAdd(page)
  await fillAndSubmit(page, { type: 'income', amount, categoryLabel: 'E2E Income', paymentLabel: 'E2E Cash' })

  await expect(page.getByText('Income added')).toBeVisible()
  // The sheet closes and the Dashboard's recent-transactions list and
  // totals refetch on their own (useTransactions' revision counter — see
  // DashboardView.vue) — no page.reload() anywhere in this test.
  await expect(page.getByText('E2E Income')).toBeVisible()
})

test('adding an expense transaction appears in the Transactions list without a reload', async ({ page }) => {
  await page.goto('/transactions')
  const amount = '222.22'
  await openQuickAdd(page)
  await fillAndSubmit(page, { type: 'expense', amount, categoryLabel: 'E2E Expense', paymentLabel: 'E2E Cash' })

  await expect(page.getByText('Expense added')).toBeVisible()
  await expect(page.getByText('E2E Expense').first()).toBeVisible()
})

test('edits a transaction and the change is reflected on the detail page', async ({ page }) => {
  await page.goto('/transactions')
  await openQuickAdd(page)
  await fillAndSubmit(page, { type: 'expense', amount: '55.55', categoryLabel: 'E2E Expense', paymentLabel: 'E2E Cash' })
  await expect(page.getByText('Expense added')).toBeVisible()

  // Newest transaction sorts first (occurred_on desc, created_at desc — see
  // useTransactions.ts), so the one just created is always the top row.
  await page.getByText('E2E Expense').first().click()
  await expect(page).toHaveURL(/\/transactions\/.+/)

  await page.getByRole('link', { name: 'Edit' }).click()
  await expect(page.getByRole('heading', { name: /^Editing expense/ })).toBeVisible()

  await page.getByLabel('Amount').fill('999.99')
  await page.getByRole('button', { name: 'Save changes' }).click()

  await expect(page.getByText('Transaction updated')).toBeVisible()
  await expect(page.getByText('999.99')).toBeVisible()
})

test('deletes a transaction and Undo restores it', async ({ page }) => {
  await page.goto('/transactions')
  await openQuickAdd(page)
  await fillAndSubmit(page, { type: 'expense', amount: '33.33', categoryLabel: 'E2E Expense', paymentLabel: 'E2E Cash' })
  await expect(page.getByText('Expense added')).toBeVisible()

  await page.getByText('E2E Expense').first().click()
  await expect(page).toHaveURL(/\/transactions\/.+/)

  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: 'Delete transaction' }).click()

  // Delete = archive under the hood; Undo is a real un-archive, not a
  // promise the UI can't keep — see docs/09-wireframes.md "Delete transaction".
  await expect(page).toHaveURL('/transactions')
  await expect(page.getByText('Transaction deleted')).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText('Transaction restored')).toBeVisible()
})
