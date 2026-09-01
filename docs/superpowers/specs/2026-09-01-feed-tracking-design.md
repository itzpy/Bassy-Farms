# Design: Feed Tracking for Pigs and Goats

**Status:** Approved
**Date:** 2026-09-01
**Builds on:** `docs/superpowers/specs/2026-08-31-farm-v1-design.md` (V1 foundation, Animals slice)

## Scope

Adds species-appropriate feed tracking to the existing Animals vertical slice:
pig feeding by development stage (starter/grower/finisher), goat feeding by
free-text feed type. This is the first of three related sub-projects
(feed tracking, pig fattening batches, crop input tracking) — the other two
are out of scope here and will get their own specs.

**Out of scope for this pass:** feed cost per feeding event (cost stays on
the existing `expense` event type), feed inventory/stock levels, any
reporting/aggregation of feed data (deferred to the existing V2 "Reports"
milestone — this pass only needs to capture the data correctly).

## 1. Data model changes

### `animals` table — new `stage` column

Pigs only track a development stage; goats never set it.

**Supabase migration (new file, additive):**
```sql
alter table animals
  add column stage text check (stage in ('starter', 'grower', 'finisher'));
```

No `not null`, no default — nullable so goats (and pigs before their first
stage is set) simply have `stage = null`.

**TypeScript (`src/lib/types.ts`):**
```ts
export type PigStage = 'starter' | 'grower' | 'finisher';
```
`Animal.stage: PigStage | null` added to the existing interface.

**Dexie (`src/lib/db.ts`):** version bump (v2 → v3, following the established
pattern from the `tag` index fix — old versions restated unchanged, new
version adds `stage` to `LocalAnimal`'s shape). `stage` does not need to be
an indexed field (no query filters on it in this pass), so no index-string
change is required — just the type change flowing through from `Animal`.

### `events.metadata` — feeding event shape (no schema change)

`metadata` is already `jsonb`, so this is a convention, not a migration.
For `event_type: 'feeding'`:
```ts
{ feed_type: string; quantity_kg: number | null }
```
- **Pig:** `feed_type` is one of `'starter' | 'grower' | 'finisher'` (same
  enum as `PigStage`) — defaults to the pig's current `stage` when the form
  opens, but can be overridden per entry (e.g. logging the first feeding at
  a new stage before formally updating the pig's stage).
- **Goat:** `feed_type` is free text — whatever the farmer types.
- `quantity_kg` is optional (nullable) for both, numeric, unit is always kg.

## 2. Data layer

### `src/features/animals/api.ts` — new `updateAnimalStage`

Mirrors the existing `updateAnimalStatus`:
```ts
export async function updateAnimalStage(id: string, stage: PigStage): Promise<void> {
  await db.animals.update(id, { stage, updated_at: new Date().toISOString(), synced: 0 });
}
```

### `src/features/events/api.ts` — no changes

`createEvent`'s existing `metadata: Record<string, unknown>` parameter
already accepts the `{ feed_type, quantity_kg }` shape — callers just need
to populate it correctly. No signature change needed.

## 3. UI changes

### `AnimalDetail.tsx`

For pigs (`animal.type === 'pig'`) only: show current stage next to status,
with a control to update it (a `<select>` + button). Note: `status` (the
analogous field on `Animal`) also has `updateAnimalStatus` implemented but
no UI control wired up yet (a known gap from the V1 foundation review) —
this is the first such control in the app; keep it minimal, matching
existing form styling, and it can serve as the pattern `status` picks up
later.

Passes `animal.type` and (for pigs) `animal.stage` down to `EventForm` as
new optional props.

### `EventForm.tsx`

New optional props:
```ts
{
  entityType: EntityType;
  entityId: string;
  animalType?: AnimalType;   // undefined when not called from AnimalDetail (e.g. future PlotDetail)
  pigStage?: PigStage | null; // only meaningful when animalType === 'pig'
  onCreated?: () => void;
}
```

When `event_type === 'feeding'`:
- If `animalType === 'pig'`: render a `feed_type` `<select>` with the three
  stage options, defaulting to `pigStage` if provided; render a numeric
  `quantity_kg` input.
- If `animalType === 'goat'`: render a `feed_type` text `<input>`; render
  the numeric `quantity_kg` input.
- Otherwise (no `animalType`, e.g. future non-animal entity types): don't
  render feed-specific fields — feeding events without feed detail remain
  valid, just less informative (this keeps `EventForm` from hard-depending
  on animal-specific data when reused for Plots later).

`createEvent`'s `metadata` argument is populated with `{ feed_type,
quantity_kg }` only when those fields are shown and filled in; otherwise
`metadata: {}` as today.

### `AnimalDetail.tsx` history list

Feeding events with feed detail should show it in the history line, e.g.
`2026-09-01 — feeding — grower, 5kg` instead of just `2026-09-01 —
feeding`. Minimal formatting change to the existing history rendering.

## 4. Testing

- `updateAnimalStage` — unit test mirroring `updateAnimalStatus`'s existing
  test (sets stage, confirms `synced: 0`).
- `EventForm` — component test(s) confirming: selecting `feeding` with
  `animalType="pig"` shows the stage dropdown defaulted to `pigStage`;
  selecting `feeding` with `animalType="goat"` shows a free-text feed-type
  input; submitting populates `metadata` correctly (verify via a Dexie read
  after submit, same pattern as `AnimalsList.test.tsx`).
- `AnimalDetail` — extend existing test or add one confirming a pig's stage
  control is visible and a goat's is not.

## 5. Error handling

No new failure modes beyond what already exists — `updateAnimalStage`
fails the same way `updateAnimalStatus` does (Dexie write failure
propagates), and the new form fields follow `EventForm`'s existing
`isSubmitting`/try-catch-and-display-error pattern already in place.
