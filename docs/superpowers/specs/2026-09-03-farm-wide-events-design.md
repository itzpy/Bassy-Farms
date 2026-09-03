# Design: Farm-Wide Events Screen

**Status:** Approved
**Date:** 2026-09-03
**Builds on:** `docs/superpowers/specs/2026-08-31-farm-v1-design.md` (V1 foundation —
`EntityType` already includes `'farm'`, and `EventForm`/`createEvent` already
special-case it),
`docs/superpowers/specs/2026-09-02-plots-and-crop-inputs-design.md`

## Scope

Closes a gap left over from the plots work: `EntityType` has always
included `'farm'`, and `EventForm`'s `EVENT_TYPES_BY_ENTITY`/
`DEFAULT_EVENT_TYPE_BY_ENTITY` lookup tables already have a `farm` entry
(`['expense', 'sale']`, defaulting to `'expense'`) — but no screen or
route ever used `entityType="farm"`. Right now a farm-wide expense or
sale (e.g. a general vet callout, fuel, an untagged sale) has no UI
entry point. This project adds that screen.

**Out of scope:** a `category` field on farm-wide events (the `events`
table has an unused `category` column intended for the future V2
profitability dashboard's filtering; adding it here with nothing to
consume it yet is premature — revisit when that dashboard is built);
editing/deleting a logged event (matches how the rest of the app
works); filtering/pagination of the history list (same, matches
`PlotDetail`/`AnimalDetail`/`BatchDetail`).

## 1. Data model

No new tables, no migration. `EntityType`'s `'farm'` value and
`EventForm`'s farm-specific lookup entries already exist. The one gap:
`createEvent`'s `NewEventInput.entity_id` is already typed
`string | null`, but `EventForm`'s `entityId` prop is typed `string`
(non-nullable) — since farm-wide events have no owning entity, this
needs widening to `string | null`, and the new screen passes `null`.

## 2. `EventForm` changes

- Widen the `entityId` prop type from `string` to `string | null`.
- Remove the now-stale comment above `FARM_EVENT_TYPES`/the `farm` keys
  in `EVENT_TYPES_BY_ENTITY`/`DEFAULT_EVENT_TYPE_BY_ENTITY` that flags
  them as an unverified placeholder — this project is what verifies
  them. No behavior change to the lists/default themselves (`['expense',
  'sale']`, defaulting to `'expense'`) — that shape was already correct.
- No other change: `showAmountField` already covers `expense`/`sale`
  regardless of entity type, and farm events use no entity-specific
  metadata fields (no feed/batch-quantity/input fields apply).

## 3. UI

### `FarmEvents.tsx` (new, in `src/features/farm/`)

Same pattern as `PlotDetail.tsx`/`AnimalDetail.tsx`/`BatchDetail.tsx`,
minus the "load a parent entity" step — there is no farm row to fetch,
so no `PENDING`-sentinel loading state is needed here.

- Embeds `<EventForm entityType="farm" entityId={null} />`.
- History list: `useLiveQuery` over `db.events.where('entity_type').equals('farm')`,
  sorted by `event_date` descending (no `entity_id` equality clause,
  since it's always `null` for this entity type). Renders each line as
  `date — type — amount — notes`, same formatting as the other detail
  screens' history lists (omit `amount`/`notes` when null, matching the
  existing `.filter(Boolean).join(...)`-style degrade-gracefully
  pattern).
- No plot/animal/batch-style "info" header — there's no entity to
  summarize, so the screen is just a heading, the log-event form, and
  the history list.

### Routing and navigation

`src/routes.tsx` gains `/farm` → `FarmEvents`. `src/App.tsx`'s nav gains
a "Farm" link alongside the existing "Animals"/"Batches"/"Plots" links.
No redirect changes — `/` still goes to `/animals`.

## 4. Testing

- `EventForm` — a test confirming `entityId={null}` is accepted and
  round-trips through `createEvent` correctly (i.e. the type widening
  doesn't break anything); existing animal/batch/plot tests must keep
  passing unmodified.
- `FarmEvents` — a component test mirroring `PlotDetail.test.tsx`'s
  shape minus the entity-fetch cases (no "not found" state applies
  here, since there's no id to look up): renders the form and an empty
  history list initially, then shows a submitted expense/sale event in
  history.

## 5. Error handling

No new failure modes — `EventForm`'s existing
`isSubmitting`/try-catch/`role="alert"` machinery already covers this
screen unchanged.
