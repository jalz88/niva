-- Manually maintained approximate rates so Dashboard/Reports can show one
-- extra, clearly-labeled "approximate combined total" line when a period
-- has activity in more than one currency. Per-currency totals stay exact
-- and unconverted everywhere else — see docs/04-ui-ux-principles.md and
-- docs/06-development-roadmap.md's "currency conversion policy" decision
-- (2026-08-02, agreed with Jalie: admin-set rate, applied at report display
-- time only, never stored against historical transactions).
alter table public.workspace_currencies
  add column reference_rate_to_default numeric,
  add column reference_rate_updated_at timestamptz;

comment on column public.workspace_currencies.reference_rate_to_default is
  'Manually maintained approximate rate to convert 1 unit of this currency into the workspace default currency. Used only for the Dashboard/Reports "approximate combined total" line, computed at report display time — never for the authoritative per-currency totals, and never stored against individual transactions. Null (no rate set) until an administrator sets one; the default currency itself never needs one (implicitly 1).';
comment on column public.workspace_currencies.reference_rate_updated_at is
  'When reference_rate_to_default was last set by an administrator — surfaced in reports as "using rates set on <date>" so the approximate total is never presented as more precise or current than it actually is.';
