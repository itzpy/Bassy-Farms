# Design: Pig Fattening Batches

**Status:** Approved
**Date:** 2026-09-02
**Builds on:** `docs/superpowers/specs/2026-08-31-farm-v1-design.md` (V1 foundation),
`docs/superpowers/specs/2026-09-01-feed-tracking-design.md` (feed tracking)

## Scope

Adds a new first-class entity — a **fattening batch**: a cohort of pigs
bought together specifically for fattening and sale, tracked as a group
rather than as individual animal records. This is the second of three
feed/farm-economics sub-projects (feed tracking done, batches here, crop
input tracking still to come — the latter depends on the not-yet-built
Plots slice).

**Out of scope:** individual per-pig tracking within a batch (explicitly
not wanted, per design conversation — a batch is a headcount, not a
collection of animal records); a dedicated Reports screen (the batch
detail page shows its own running profitability, but there's no
cross-batch comparison view in this pass); editing/correcting a
already-logged sale or death event (only adding new events, matching how
the rest of the app works today — no edit/delete anywhere yet).

## 1. Data model

### New `batches` table

**Supabase migration:**
```sql
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
```

**TypeScript (`src/lib/types.ts`):**
```ts
export interface Batch {
  id: string;
  name: string;
  purchase_date: string;
  initial_count: number;
  purchase_cost: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
```
`EntityType` extended: `'animal' | 'plot' | 'farm' | 'batch'`.

**Dexie (`src/lib/db.ts`):** a genuinely new object store, so this DOES
need a version bump (unlike the feed-tracking `stage` field, which was
just a new property on an existing store — a brand new store must be
declared in `.stores()` before Dexie/IndexedDB will create it). New
`version(3)` restates `animals`/`plots`/`events` unchanged from
`version(2)` and adds `batches: 'id, synced, updated_at'`. `sync.ts`'s
`SYNC_TABLES` constant gains `'batches'`.

### Events against a batch — no new event types needed for cost, but a new metadata shape

A batch's costs, sales, and deaths are logged as ordinary `events` rows
with `entity_type: 'batch'`, `entity_id: <batch id>`, using the
**existing** `event_type` values `expense`, `sale`, and `death` — no new
enum values needed.

- **`expense`** (feed, vet, etc. for the whole batch): uses the existing
  `amount` column — see §2 below, since `EventForm` currently never lets
  a user enter an amount at all (a pre-existing gap this pass fixes,
  benefiting animal-level expense/sale logging too, not just batches).
- **`sale`**: `amount` (revenue from that sale) plus a new metadata field
  `quantity` (how many pigs were sold in that sale — batches are sold a
  few at a time, not always as one lump).
- **`death`**: metadata `quantity` (how many pigs died — almost always
  `1`, but not constrained to be).

`quantity` here is a **headcount** (integer, pigs), distinct from feed
tracking's `quantity_kg` (a weight) — different field name, different
unit, no collision in the shared `metadata: Record<string, unknown>`
column since they're only ever used together on different `event_type`s.

### Headcount and profitability are computed, not stored

No `current_count` or running-total column on `batches`. Both are derived
client-side from the batch's events, the same way `unsyncedCount()`
already derives its number from a live Dexie query rather than a stored
counter:

```
current_count = initial_count
  − Σ(quantity from this batch's 'sale' events)
  − Σ(quantity from this batch's 'death' events)

total_cost = (purchase_cost ?? 0) + Σ(amount from this batch's 'expense' events)
total_revenue = Σ(amount from this batch's 'sale' events)
profit = total_revenue − total_cost
```

This avoids a dual-write consistency problem (updating both an event log
and a separate counter in the same logical operation) and matches the
codebase's existing "events are the source of truth, views are derived"
philosophy.

## 2. `EventForm` changes

Two changes, both additive to the existing component (already extended
once for feed tracking):

### a. Amount field (fixes an existing gap, not batch-specific)

`EventForm` currently hardcodes `amount: null` on every submission — there
has never been a way to actually enter a cost/revenue amount from the UI,
for animals or anything else. Add an `Amount` numeric input, shown when
`eventType === 'expense'` or `eventType === 'sale'`, regardless of
`entityType`. Empty stays `null` (as today); a non-negative number is
sent as `amount`. This one change also makes animal-level expense/sale
logging actually usable, which it technically hasn't been until now.

### b. Entity-aware event type list, and a headcount field for batch sale/death

Today `EventForm` always offers the same fixed event-type dropdown
(feeding, vaccination, weight, health_check, breeding, death, expense,
sale) regardless of what it's attached to. For a batch, most of those
don't apply — a batch isn't vaccinated or weighed as a unit. Add a
second, batch-specific list:
```ts
const BATCH_EVENT_TYPES: EventType[] = ['expense', 'sale', 'death'];
```
`EventForm` picks `BATCH_EVENT_TYPES` when `entityType === 'batch'`,
otherwise the existing `ANIMAL_EVENT_TYPES` list (name kept as-is to
minimize the diff — it's really "the non-batch list"). The form's
default `eventType` on mount is `'feeding'` for `entityType === 'animal'`
(unchanged) and `'expense'` for `entityType === 'batch'` (new).

When `entityType === 'batch'` and `eventType` is `'sale'` or `'death'`,
show a `Number of pigs` integer input (id `batch-quantity`, distinct from
feed tracking's `feed-quantity` field — no id collision since they never
render at the same time). Defaults to `1`. Stored as `metadata.quantity`
on submit, following the same "only include if present/valid" pattern
`quantity_kg` already uses (reject non-finite or non-positive values,
mirroring the existing negative-quantity guard added for feed tracking).

## 3. Data layer

`src/features/batches/api.ts`, mirroring `src/features/animals/api.ts`'s
shape:
```ts
export interface NewBatchInput {
  name: string;
  purchase_date: string;
  initial_count: number;
  purchase_cost: number | null;
  notes: string | null;
}

export async function createBatch(input: NewBatchInput): Promise<string>
```
No update function needed in this pass — a batch's own fields
(`name`/`purchase_date`/`initial_count`/`purchase_cost`) aren't expected
to change after creation; headcount/profitability changes happen via
events, not by editing the batch record.

## 4. UI

### `BatchesList.tsx` + inline create form
Same pattern as `AnimalsList.tsx`/`AnimalForm.tsx`: a list of existing
batches (name, purchase date, computed current headcount out of initial),
each linking to its detail page, with an inline form to create a new one.

### `BatchDetail.tsx`
Same pattern as `AnimalDetail.tsx`: shows the batch's name/purchase
info, a computed summary block (current headcount / initial, total
cost, total revenue, profit — profit shown as a plain positive/negative
number, no special styling logic needed beyond what the color system
already provides), the `EventForm` (with `entityType="batch"`), and an
event history list. History lines for `sale`/`death` events should show
the headcount, e.g. `2026-09-10 — sale — 3 pigs`.

### Minimal navigation
There is currently no way to reach anything in this app except by typing
a URL — `/` redirects straight to `/animals` with no menu. This was fine
with one screen family; it stops being fine with two. Add a small nav
element (plain links, "Animals" / "Batches") visible across the
authenticated app shell — the minimum necessary for the feature to
actually be reachable, not a broader navigation redesign.

### Routing
`src/routes.tsx` gains `/batches` → `BatchesList`, `/batches/:id` →
`BatchDetail`.

## 5. Testing

- `createBatch` — unit test mirroring `createAnimal`'s (stores an
  unsynced batch with the given fields).
- `EventForm` — tests confirming: the amount field shows for
  expense/sale on any entity type and is stored correctly; the batch
  event-type list differs from the animal one; the headcount field shows
  only for batch sale/death, defaults to 1, rejects invalid values the
  same way `quantity_kg` does.
- `BatchesList` — component test mirroring `AnimalsList.test.tsx` (create
  a batch via the form, see it in the list).
- `BatchDetail` — component test(s) confirming: headcount/cost/revenue/
  profit computed correctly from a batch's events; a sale event reduces
  displayed headcount; history shows headcount for sale/death lines.

## 6. Error handling

No new failure modes — `createBatch` follows the same
propagate-Dexie-errors pattern as `createAnimal`; `EventForm`'s existing
`isSubmitting`/try-catch/`role="alert"` machinery already covers the new
fields since they're just additional inputs feeding the same
`createEvent` call.
