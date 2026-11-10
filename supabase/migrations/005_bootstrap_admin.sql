-- 005: first-administrator helper (safe to re-run).
-- After creating your login under Authentication > Users, run:
--     select public.grant_admin('you@example.com');
create or replace function public.grant_admin(p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from auth.users where lower(email) = lower(p_email);
  if v is null then
    raise exception 'No user with email %. Create the user under Authentication > Users first.', p_email;
  end if;
  insert into public.profiles (id, email) values (v, p_email) on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (v, 'admin') on conflict do nothing;
  return 'Administrator role granted to ' || p_email;
end $$;
revoke all on function public.grant_admin(text) from public, anon, authenticated;
