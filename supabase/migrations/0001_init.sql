create table animals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  type text not null check (type in ('pig','goat')),
  tag text not null,
  birth_date date,
  status text not null default 'active' check (status in ('active','sold','deceased')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table plots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  name text not null,
  crop_type text,
  planted_date date,
  area numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  client_id uuid not null unique,
  event_type text not null check (event_type in (
    'feeding','vaccination','weight','health_check','breeding','death',
    'planting','harvest','expense','sale'
  )),
  entity_type text not null check (entity_type in ('animal','plot','farm')),
  entity_id uuid,
  event_date date not null,
  amount numeric,
  category text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table animals enable row level security;
alter table plots enable row level security;
alter table events enable row level security;

create policy "animals_owner" on animals
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "plots_owner" on plots
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "events_owner" on events
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
