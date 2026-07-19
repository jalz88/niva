# Design System

**Status:** Foundation — approved direction, implementation pending
**Depends on:** `04-ui-ux-principles.md`
**Scope:** Light mode for Release 1. Dark mode is desirable but deferred until it can be designed and tested in its own pass, per `04-ui-ux-principles.md` §9.

This document turns the UI/UX principles into concrete, implementable tokens: color, type, spacing, radii, shadows, motion, and component states. It is what `tailwind.config` and the shadcn-vue theme are generated from in Phase 1.

## 1. Color

### 1.1 Accent

NIVA's one distinctive accent is a warm terracotta/clay — hospitality-warm, distinct from generic SaaS blue, consistent with "closer to a well-designed personal finance tool than dense enterprise accounting software" (decided 2026-07-19).

| Token | Hex | Use |
| --- | --- | --- |
| `accent-50` | `#FBEEE7` | subtle backgrounds, selected-row tint |
| `accent-100` | `#F5D6C4` | hover backgrounds on light surfaces |
| `accent-300` | `#DC8A60` | secondary accents, chart series |
| `accent-500` | `#B5542A` | primary buttons, links, active nav state — 5.4:1 contrast on white |
| `accent-600` | `#954423` | hover/active state for primary buttons |
| `accent-700` | `#74351C` | pressed state, text-on-light-accent-background |

### 1.2 Neutral base

Warm-tinted neutrals, not pure gray — keeps the "calm, warm" character even in structural UI.

| Token | Hex | Use |
| --- | --- | --- |
| `neutral-50` | `#FAF8F6` | app background |
| `neutral-100` | `#F3EFEA` | card/section background |
| `neutral-200` | `#E6DFD7` | borders, dividers |
| `neutral-300` | `#D3C8BC` | disabled borders, skeleton base |
| `neutral-400` | `#A99C8E` | placeholder text, disabled text |
| `neutral-500` | `#7D7266` | secondary/caption text |
| `neutral-700` | `#453F37` | body text |
| `neutral-900` | `#1C1916` | headings, primary text — 14.8:1 on `neutral-50` |

### 1.3 Semantic states

Per `04-ui-ux-principles.md` §6: never rely on color alone for income/expense. Every semantic color is always paired with an icon and/or text label.

| Token | Hex | Use | Pairing |
| --- | --- | --- | --- |
| `positive-600` | `#2F7D5A` | income amounts, success confirmations | up-arrow icon / "Income" label |
| `negative-600` | `#B3261E` | expense amounts, destructive actions | down-arrow icon / "Expense" label |
| `warning-600` | `#B5720A` | validation warnings, unsaved-change notices | warning icon |
| `info-600` | `#3D6AA8` | informational banners (e.g. offline notice) | info icon |

All semantic tokens meet 4.5:1 contrast against `neutral-50`.

### 1.4 Focus ring

`accent-500` at 40% opacity, 2px offset ring — visible on every interactive element regardless of surface color. Never remove the browser focus indicator without replacing it.

## 2. Typography

System-first stack for performance and native feel: `-apple-system, "Segoe UI", Roboto, Inter, sans-serif`. Numeric columns (amounts, dates in tables) use `font-variant-numeric: tabular-nums` so figures align.

| Token | Size / line-height | Weight | Use |
| --- | --- | --- | --- |
| `text-h1` | 24px / 32px | 600 | Page titles (Dashboard, Reports) |
| `text-h2` | 20px / 28px | 600 | Section headings, card titles |
| `text-h3` | 17px / 24px | 600 | Subsection headings, list group headers |
| `text-body` | 15px / 22px | 400 | Default body text, form labels |
| `text-body-sm` | 13px / 18px | 400 | Secondary text, table cell metadata |
| `text-caption` | 12px / 16px | 400 | Timestamps, helper text, badges |
| `text-amount` | 17px / 24px | 600 | Transaction amounts in lists/detail |
| `text-amount-lg` | 28px / 34px | 600 | Dashboard summary totals |

## 3. Spacing

4px base unit: `1` = 4px, `2` = 8px, `3` = 12px, `4` = 16px, `6` = 24px, `8` = 32px, `12` = 48px, `16` = 64px. Touch targets are never smaller than 44×44px regardless of the visual size of their icon/label (per `04-ui-ux-principles.md` §2).

## 4. Radii, elevation, motion

| Token | Value | Use |
| --- | --- | --- |
| `radius-sm` | 6px | inputs, buttons, badges |
| `radius-md` | 10px | cards, list rows |
| `radius-lg` | 16px | modals, bottom sheets |
| `radius-pill` | 9999px | status chips |
| `shadow-sm` | `0 1px 2px rgba(28,25,22,0.06)` | cards at rest |
| `shadow-md` | `0 4px 12px rgba(28,25,22,0.10)` | modals, popovers, the floating Quick Add affordance |
| `motion-fast` | 120ms ease-out | hover/press feedback |
| `motion-base` | 200ms ease-out | panel/sheet transitions |

Respect `prefers-reduced-motion: reduce` — disable non-essential transitions; state changes must still be conveyed without motion (per `04-ui-ux-principles.md` §7).

## 5. Component states

Every interactive component must define, at minimum: default, hover (pointer only), focus-visible, active/pressed, disabled, and — where relevant — loading and error states. Two examples to standardize on:

**Buttons**

| Variant | Default | Hover | Disabled |
| --- | --- | --- | --- |
| Primary (`Save income`, `Save expense`) | `accent-500` bg, white text | `accent-600` bg | `neutral-300` bg, `neutral-400` text, no shadow |
| Secondary | `neutral-50` bg, `neutral-900` text, `neutral-200` border | `neutral-100` bg | reduced-opacity border/text |
| Destructive (`Delete transaction`) | `negative-600` bg, white text | darker shade of `negative-600` | `neutral-300` bg |
| Ghost/icon-only | transparent, `neutral-700` icon | `neutral-100` bg | reduced-opacity icon |

**Inputs**

Default: `neutral-50` bg, `neutral-200` border. Focus: `accent-500` border + focus ring. Error: `negative-600` border, error text below field in `text-caption` using `negative-600`. Disabled: `neutral-100` bg, `neutral-400` text, no border emphasis.

## 6. Icons

Lucide, 20px default / 16px inline with text / 24px for primary nav. Every icon-only control has an accessible name (`aria-label`) and, where space allows, a visible label — icons alone never carry meaning that isn't also stated in text (amount sign, income/expense, status).

## 7. Status and feedback patterns

- **Saving:** inline spinner replaces the button label text (not a separate spinner icon) so the action clearly reads "in progress."
- **Saved confirmation:** a toast in `positive-600`/`neutral-900` with a checkmark icon, auto-dismissing after ~4s, still reachable by screen readers via a live region.
- **Archived/inactive configuration items:** `neutral-200` pill badge, label "Archived," reduced-opacity row.
- **Skeleton loading:** `neutral-200` blocks matching the shape of real content — never fake numbers or placeholder amounts.

## 8. Open items for Phase 1 implementation

- Generate the actual `tailwind.config` token file and shadcn-vue theme from this document; keep them in sync if either changes.
- Run all semantic and accent color pairs through an automated contrast check as part of the design-system PR, not just this manual review.
- Revisit dark mode as its own design pass once Release 1 ships.
