# UI/UX Principles

## Design promise

NIVA must make a non-accountant feel confident. Each screen should state what it is for, guide the next action, and make the result of that action unmistakable.

## 1. Design for the job, not the feature list

Primary jobs are: understand this month, record income, record an expense, correct a record, and understand where money came from or went. Navigation and visual hierarchy must put these jobs ahead of administration and future modules.

## 2. Mobile first; responsive by intent

- Design the primary transaction flow for a narrow phone viewport and touch input first.
- Use a persistent, reachable Quick Add affordance on small screens.
- Use at least 44 × 44 CSS-pixel touch targets and ample spacing between destructive actions.
- On larger screens, use space for readable tables, side-by-side report detail, and efficient filtering—not to make controls smaller.
- Support current mobile Safari and Chromium browsers; test keyboard, zoom, orientation, and safe-area behavior.

## 3. Clear navigation

Initial navigation contains only:

- Dashboard
- Transactions
- Reports
- Administration

Quick Add is an action, not a destination. Administration groups configurable business values without exposing them in the everyday flow. A user must always be able to identify the current section, selected property, and reporting period.

## 4. Transaction form rules

- Choose **Income** or **Expense** first; use language and fields appropriate to that type.
- Mark required fields visibly and explain optional fields in plain language.
- Default intelligently (current date, last-used or default property/currency/payment method) but never hide a default.
- Keep the initial form short: amount, type, date, property, category, payment method; platform is shown for income and supplier for expense. Notes are optional.
- Use numeric keyboard and locale-appropriate amount formatting. Preserve the typed value until successful save or intentional discard.
- Validate as helpfully as possible: near the field, in plain language, after an appropriate interaction. Do not wait until submit to reveal every obvious omission.
- The primary action says **Save income** or **Save expense**, not a vague “Submit.”

## 5. Mandatory action feedback

### Saving

1. On submit, disable duplicate submission and show an inline saving state.
2. On success, show a concise confirmation such as “Expense saved” and identify the amount/category when useful.
3. Update the transaction list and relevant summary without forcing a manual refresh.
4. On failure, retain every entered value, explain the problem, and offer **Try again**. Never show a success message until the server confirms success.

### Editing

- The edit screen identifies the original transaction and shows a meaningful primary action: **Save changes**.
- On success, state “Transaction updated” and refresh dependent totals.
- If data changed elsewhere while editing, prevent silent overwrite; present a clear resolution path when concurrency handling is introduced.

### Deleting

- Prefer archive/soft-delete where the schema and reporting rules allow; preserve an audit trail.
- A delete confirmation names the exact transaction (date, amount, category) and states the consequence.
- Destructive confirmation uses an explicit button such as **Delete transaction**; it must not be the default focused action.
- Where a recoverable undo is technically reliable, offer a short-lived **Undo** after deletion. Otherwise, say clearly that the action cannot be undone.
- Configuration in use is archived/disabled rather than deleted.

### Loading, empty, and error states

- Use skeletons for predictable page loading; do not show fake numbers.
- Empty states explain what is missing and provide the next relevant action, e.g. “No expenses this month. Add an expense.”
- Error states explain the user impact and recovery step without exposing technical details.
- Distinguish “no results match these filters” from “there are no transactions.”
- When offline, show a persistent but unobtrusive connection notice and disable saving in Release 1.

## 6. Financial information presentation

- Make amount, transaction type, date, and category scannable in lists.
- Never rely on red/green alone to indicate expense/income; pair colour with sign, text, icon, or label.
- Display the active currency beside totals and amounts. Never combine different currencies into one total without an explicit conversion policy.
- Label the date basis and selected period on every report.
- Treat tables/totals as the authoritative report; charts help pattern recognition but must not be the only way to access a value.
- Use “Net result” in the product unless a later accounting decision explicitly defines “profit.”

## 7. Accessible by default

- Meet WCAG 2.2 AA as the target for contrast, focus, keyboard operation, labels, error identification, and readable text.
- Use semantic HTML first. Accessible component primitives are not a substitute for correct labels and behavior.
- Ensure every form field has a visible label; placeholder text is never the only label.
- Every icon-only control has an accessible name and tooltip where useful.
- Keep status messages available to assistive technologies using appropriate live regions.
- Respect reduced-motion preferences and never use motion as the only confirmation.

## 8. Tone and microcopy

Use short, warm, direct language:

| Prefer | Avoid |
| --- | --- |
| “Expense saved” | “Operation completed successfully” |
| “Choose a category” | “Invalid input” |
| “No transactions match these filters” | “No data” |
| “Delete transaction?” | “Are you sure?” |
| “Try again” | “Unhandled error” |

Do not blame the user. Explain what is needed and keep control labels specific.

## 9. Visual system direction

- Calm, clean, warm, and precise—not generic accounting software.
- Use a restrained neutral base, one distinctive accessible accent colour, and semantic state colours.
- Prefer whitespace and type hierarchy to borders and decoration.
- Use subtle corner radii, restrained shadows, and short purposeful motion.
- Support light mode first; dark mode is desirable but must be designed and tested, not automatically inverted.

## 10. UI definition of done

A screen is not complete until it has responsive layouts; loading, empty, error, and permission-denied states; keyboard and touch support; accessible labels/focus; validation; feedback after mutations; and a review on a real small-screen viewport.
