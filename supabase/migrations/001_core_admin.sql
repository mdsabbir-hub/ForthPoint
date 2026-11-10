-- 001: core master data, administration, helper functions
create type public.app_role as enum ('admin', 'reviewer', 'publisher');

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
create index user_roles_user_idx on public.user_roles(user_id);
create table public.bootstrap_admins (email text primary key);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs(created_at desc);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);

create or replace function public.has_role(_role public.app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = _role)
$$;
create or replace function public.has_any_role() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid())
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
    on conflict (id) do nothing;
  if exists (select 1 from public.bootstrap_admins b where lower(b.email) = lower(new.email)) then
    insert into public.user_roles (user_id, role) values (new.id, 'admin') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.sectors (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  sector_type text not null default 'industrial' check (sector_type in ('industrial','bank','insurance','other')),
  created_at timestamptz not null default now()
);
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  short_name text,
  sector_id uuid references public.sectors(id),
  exchange text not null default 'DSE',
  country text not null default 'BD',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index companies_sector_idx on public.companies(sector_id);
create trigger companies_updated before update on public.companies for each row execute function public.set_updated_at();

create table public.securities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ticker text not null unique,
  exchange text not null default 'DSE',
  isin text unique,
  currency text not null default 'BDT',
  is_primary boolean not null default true,
  created_at timestamptz not null default now()
);
create index securities_company_idx on public.securities(company_id);
create unique index securities_one_primary on public.securities(company_id) where is_primary;

create table public.company_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  description text,
  website text,
  founded_year int,
  headquarters text,
  updated_at timestamptz not null default now()
);
