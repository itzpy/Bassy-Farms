# Design: Plots and Crop Input Tracking

**Status:** Approved
**Date:** 2026-09-02
**Builds on:** `docs/superpowers/specs/2026-08-31-farm-v1-design.md` (V1 foundation — `plots` table,
`Plot` type, and `EntityType`/`EventType` already exist, just no UI was ever built),
`docs/superpowers/specs/2026-09-01-feed-tracking-design.md`,
`docs/superpowers/specs/2026-09-02-fattening-batches-design.md`

## Scope

This is the third and final sub-project from the original farm-economics
request (feed tracking, fattening batches, done; crop input tracking here).
It has two parts: (1) building the missing Plots UI — the `plots` table,
`Plot` TypeScript type, and Dexie/sync wiring already exist from the V1
foundation, but no `PlotsList`/`PlotDetail` screens or routes were ever
built; (2) adding crop input application tracking (insecticide,
fungicide, herbicide, fertilizer, or other) as a new event type against
a plot.

**Out of scope:** editing/deleting a plot or a logged event (matches how
the rest of the app works — no edit/delete anywhere yet); an
inventory/stock view of purchased inputs (this tracks applications, not
stock on hand); reports/aggregation across plots (deferred to the
existing future "Reports" milestone, same as everywhere else in this
app).

## 1. Data model

### No new tables

`plots` (Supabase + Dexie) already exists exactly as needed:
`id, name, crop_type, planted_date, area, notes, created_at, updated_at`.
`EntityType` already includes `'plot'`. No migration needed for this part.

### New `EventType` value: `input_application`

`src/lib/types.ts`'s `EventType` union gains `'input_application'`,
alongside the existing `'planting'`/`'harvest'` values already reserved
for plots. This is a Supabase-side change too — the `events` table's
`event_type` check constraint (from `0001_init.sql`) needs a new
migration widening the allowed set.

### `events.metadata` shape for `input_application`

No schema change (jsonb, as with every other event-type-specific
metadata shape in this app):
```ts
{
  input_type: 'insecticide' | 'fungicide' | 'herbicide' | 'fertilizer' | 'other';
  product_name: string | null;
  quantity: number | null;
  unit: 'liters' | 'kg' | null;
}
```
Cost stays on the existing `expense` event type, tagged to the plot —
same pattern as feed tracking and batch costs: the application event
records what/how much was applied, not what it cost.

## 2. `EventForm` changes

This is the third time `EventForm` gains entity-specific fields (feed
tracking, then batches, now plots). The event-type dropdown is currently
selected via a two-way ternary (`entityType === 'batch' ? BATCH_EVENT_TYPES
: ANIMAL_EVENT_TYPES`) — adding a third entity type via a third ternary
branch would start to genuinely hurt readability, so this pass converts
it to a lookup table:
```ts
const EVENT_TYPES_BY_ENTITY: Record<EntityType, EventType[]> = {
  animal: ANIMAL_EVENT_TYPES, // unchanged: feeding, vaccination, weight, health_check, breeding, death, expense, sale
  batch: BATCH_EVENT_TYPES,   // unchanged: expense, sale, death
  plot: ['planting', 'harvest', 'input_application', 'expense', 'sale'],
  farm: ['expense', 'sale'],  // not yet used by any screen, but EntityType requires every key present
};
```
This is a structural cleanup, not a behavior change for animals/batches —
`EVENT_TYPES_BY_ENTITY[entityType]` replaces the ternary chain but
produces identical results for the two existing entity types.

Default `eventType` on mount follows the same "most frequent action for
this entity" pattern already established (`'feeding'` for animals,
`'expense'` for batches): `'input_application'` for plots, since once a
plot exists, logging input applications is the far more common ongoing
action than re-logging a planting.

New fields, shown when `eventType === 'input_application'`:
- `input_type` — a `<select>` with the five values above, no default
  pre-selection bias toward one input type (unlike pig stage, there's no
  natural "current state" to default from).
- `product_name` — free text, optional.
- `quantity` + `unit` — a numeric input paired with a `<select>` (liters/kg),
  following the same validation pattern already established for
  `quantity_kg` (feed) and `quantity` (batch headcount): reject
  non-finite or negative values, omit from metadata if blank.

## 3. UI

### `PlotForm.tsx` + `PlotsList.tsx`
Same pattern as `AnimalsList.tsx`/`AnimalForm.tsx` and
`BatchesList.tsx`/`BatchForm.tsx`: a list of plots (name, crop type,
planted date), each linking to its detail page, with an inline create
form (name, crop type, planted date, area — `notes` not collected at
creation, matching the existing `AnimalForm`/`BatchForm` convention of
leaving `notes` for later rather than cluttering the create form).

### `PlotDetail.tsx`
Same pattern as `AnimalDetail.tsx`/`BatchDetail.tsx`: shows the plot's
info, embeds `EventForm` with `entityType="plot"`, and an event history
list. History lines for `input_application` events should show the
detail, e.g. `2026-09-10 — input_application — insecticide, Roundup, 2
liters` (omitting any part that's null/blank, matching how
`formatFeedDetail`/`formatBatchDetail` already degrade gracefully).

### Routing and navigation
`src/routes.tsx` gains `/plots` → `PlotsList`, `/plots/:id` →
`PlotDetail`. `src/App.tsx`'s nav gains a "Plots" link alongside the
existing "Animals"/"Batches" links.

## 4. Testing

- `EventForm` — tests confirming: `entityType="plot"` offers the correct
  5-item event-type list defaulting to `input_application`; the
  input-type/product-name/quantity/unit fields show only for
  `input_application` and store correctly; invalid quantity is rejected
  the same way `quantity_kg`/batch `quantity` already are; the
  `EVENT_TYPES_BY_ENTITY` refactor doesn't change animal/batch behavior
  (existing tests already assert this — they must keep passing
  unmodified).
- `PlotsList` — component test mirroring `AnimalsList.test.tsx`/`BatchesList.test.tsx`.
- `PlotDetail` — component test(s) mirroring `AnimalDetail.test.tsx`/`BatchDetail.test.tsx`:
  valid id shows the plot, invalid id shows not-found, an
  `input_application` event with metadata shows correctly formatted
  detail in history.

## 5. Error handling

No new failure modes — `createPlot` (new, mirroring `createAnimal`/`createBatch`)
follows the same propagate-Dexie-errors pattern; `EventForm`'s existing
`isSubmitting`/try-catch/`role="alert"` machinery already covers the new
fields.
