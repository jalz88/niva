-- Real bug found 2026-08-31 (documented 2026-09-04), live multi-device
-- testing (Jalie + her mother + the housekeeper Subashani, one on Android,
-- one on iPhone): when Subashani completed a task on her phone, her
-- mother's Today's schedule view on a different phone did not update until
-- she manually closed and reopened the app. Root cause: Realtime was never
-- enabled for ANY table in this project (an empty supabase_realtime
-- publication), and the client had no polling either -- each device's
-- Today view only ever refetches on its own local actions
-- (useHousekeepingToday's `revision` ref is module-scoped per browser tab,
-- not shared across devices). Multiple people are now routinely looking at
-- the same room's checklist from separate phones at the same time, so this
-- needs to be genuinely live.
--
-- Every table added here already has an is_workspace_member(workspace_id)
-- SELECT policy (confirmed before this migration), so Realtime's
-- Postgres Changes feature -- which enforces RLS using the subscribing
-- client's own JWT -- won't leak a change across workspaces.
alter publication supabase_realtime add table
  public.sop_task_completions,
  public.sop_task_skips,
  public.sop_task_occupancy_overrides,
  public.room_inspections;
