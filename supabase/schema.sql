-- Family Budget — database setup.
--
-- Run this once, whole file, in the Supabase SQL editor.
-- Safe to run again: everything is "if not exists" or "drop then create".
--
-- The rule underneath all of it: you can only touch rows belonging to a
-- household you are a member of. That is enforced by the database itself
-- (row level security), not by the app, so it holds even if someone gets hold
-- of the public key.

-- ---------------------------------------------------------------- households

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our budget',
  created_at timestamptz not null default now()
);

create table if not exists household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 'owner' can wipe the budget; 'member' can do everything else.
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index if not exists household_members_user_idx on household_members(user_id);

/* Membership check.
   Marked `security definer` so it reads household_members without going back
   through that table's own policy — otherwise the policy would need to query
   the table it is protecting and Postgres recurses forever. */
create or replace function is_member(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from household_members
    where household_id = target and user_id = auth.uid()
  );
$$;

-- ----------------------------------------------------------------- the data

create table if not exists people (
  id text not null,
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  full_name text not null,
  currency text not null check (currency in ('USD', 'ZAR')),
  country text not null default '',
  slot int not null default 1,
  initials text not null default '',
  primary key (household_id, id)
);

create table if not exists income (
  id text not null,
  household_id uuid not null references households(id) on delete cascade,
  person_id text not null,
  label text not null default '',
  amount numeric not null default 0,
  currency text not null check (currency in ('USD', 'ZAR')),
  frequency text not null,
  kind text not null default 'other',
  active boolean not null default true,
  verified boolean not null default true,
  note text,
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);

create table if not exists expenses (
  id text not null,
  household_id uuid not null references households(id) on delete cascade,
  label text not null default '',
  category text not null default 'Living',
  amount numeric not null default 0,
  currency text not null check (currency in ('USD', 'ZAR')),
  frequency text not null,
  owner text not null,
  paid_by text not null,
  split jsonb,
  due_day int check (due_day between 1 and 31),
  account text,
  active boolean not null default true,
  verified boolean not null default true,
  note text,
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);

create table if not exists debts (
  id text not null,
  household_id uuid not null references households(id) on delete cascade,
  label text not null default '',
  person_id text not null,
  lender text not null default '',
  currency text not null check (currency in ('USD', 'ZAR')),
  principal numeric not null default 0,
  verified boolean not null default true,
  note text,
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);

create table if not exists debt_payments (
  id text not null,
  household_id uuid not null references households(id) on delete cascade,
  debt_id text not null,
  date date not null,
  amount numeric not null default 0,
  paid boolean not null default false,
  note text,
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);

create index if not exists debt_payments_debt_idx on debt_payments(household_id, debt_id);

create table if not exists ledger (
  id text not null,
  household_id uuid not null references households(id) on delete cascade,
  date date not null,
  person_id text not null,
  label text not null default '',
  amount numeric not null default 0,
  currency text not null check (currency in ('USD', 'ZAR')),
  type text not null default 'income' check (type in ('income', 'expense')),
  primary key (household_id, id)
);

create index if not exists ledger_date_idx on ledger(household_id, date);

create table if not exists savings (
  id text not null,
  household_id uuid not null references households(id) on delete cascade,
  person_id text not null,
  label text not null default '',
  amount numeric not null default 0,
  currency text not null check (currency in ('USD', 'ZAR')),
  note text,
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);

-- One row per bill per month, only for the ones ticked off.
create table if not exists checklist (
  household_id uuid not null references households(id) on delete cascade,
  key text not null,
  paid boolean not null default true,
  primary key (household_id, key)
);

/* Shared settings only. Theme and which currency to show totals in are a
   personal preference — those stay on each person's own device, so Liz can
   read in rand and dark while Will reads in dollars and light. */
create table if not exists settings (
  household_id uuid primary key references households(id) on delete cascade,
  usd_zar_rate numeric not null default 16.4612,
  rate_updated_at date not null default current_date,
  auto_rate boolean not null default true,
  rate_source text not null default 'manual',
  data_mode text not null default 'live',
  sa_total_rent numeric not null default 0,
  sa_rent_from_daddy numeric not null default 0,
  sa_rent_expense_id text not null default 'exp-shared-rent',
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------- access

alter table households        enable row level security;
alter table household_members enable row level security;
alter table people            enable row level security;
alter table income            enable row level security;
alter table expenses          enable row level security;
alter table debts             enable row level security;
alter table debt_payments     enable row level security;
alter table ledger            enable row level security;
alter table savings           enable row level security;
alter table checklist         enable row level security;
alter table settings          enable row level security;

-- Every data table gets the same rule, keyed on household_id.
do $$
declare t text;
begin
  foreach t in array array[
    'people','income','expenses','debts','debt_payments','ledger','savings','checklist','settings'
  ] loop
    execute format('drop policy if exists members_all on %I', t);
    execute format(
      'create policy members_all on %I for all
         using (is_member(household_id))
         with check (is_member(household_id))', t);
  end loop;
end $$;

drop policy if exists members_read on households;
create policy members_read on households
  for select using (is_member(id));

drop policy if exists members_update on households;
create policy members_update on households
  for update using (is_member(id)) with check (is_member(id));

-- Anyone signed in may create a household; they then add themselves to it.
drop policy if exists signed_in_insert on households;
create policy signed_in_insert on households
  for insert to authenticated with check (true);

drop policy if exists own_rows on household_members;
create policy own_rows on household_members
  for select using (user_id = auth.uid() or is_member(household_id));

drop policy if exists join_self on household_members;
create policy join_self on household_members
  for insert to authenticated with check (user_id = auth.uid());

-- ---------------------------------------------------------------- live sync
-- So one person's change appears on the other's screen without a refresh.

do $$
declare t text;
begin
  foreach t in array array[
    'people','income','expenses','debts','debt_payments','ledger','savings','checklist','settings'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then
      null;
    end;
  end loop;
end $$;
