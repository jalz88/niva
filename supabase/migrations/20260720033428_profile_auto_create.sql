-- profiles was never populated automatically — every new auth.users row
-- needs a matching profiles row so the Users admin screen (and anything
-- else that displays a member's name/email) has something to show.
-- Standard Supabase pattern: trigger on auth.users, backfilled once here
-- for any users created before this migration existed.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

insert into public.profiles (id, email, display_name)
select id, email, email from auth.users
on conflict (id) do nothing;
