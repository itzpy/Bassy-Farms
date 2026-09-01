create table batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  name text not null,
  purchase_date date not null,
  initial_count integer not null check (initial_count > 0),
  purchase_cost numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table batches enable row level security;

create policy "batches_owner" on batches
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
