-- handle_new_user() is a trigger function only — it has no legitimate
-- direct caller, and trigger execution doesn't require the invoking role
-- to hold EXECUTE. Revoking closes the RPC surface the security advisor
-- flagged after migration 0003.

revoke execute on function handle_new_user() from public, anon, authenticated;
