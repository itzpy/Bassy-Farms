# Design: Profitability Dashboard (V2)

**Status:** Approved
**Date:** 2026-09-03
**Builds on:** `docs/superpowers/specs/2026-08-31-farm-v1-design.md` (events table, `EventType`/`EntityType`),
`docs/superpowers/specs/2026-09-03-farm-wide-events-design.md` (farm-wide events, the last of the
five buckets this dashboard aggregates)

## Scope

This is `farm-prd.md`'s Milestone 2 ("Financial visibility") — the PRD's core goal
("Enable profitability visibility") has had zero UI until now. All the underlying
data already exists (every entity type logs `expense`/`sale` events); this project
adds a read-only screen that aggregates it.

**Out of scope:**
- The `events.category` column — still unused everywhere in the app (see the
  farm-wide-events spec's out-of-scope note); this dashboard filters by
  livestock-type/batch/plot/farm instead, since that's what's actually tracked
  today. Revisit if/when category tagging is ever added.
- Per-individual-entity rows (one row per animal tag, per named batch, per named
  plot) — grouping is by type/bucket only (Pigs, Goats, Batches, Plots,
  Farm-wide), matching the PRD's "filterable by livestock type or plot" wording
  and keeping the table short regardless of how many animals/plots exist.
- Charts/graphs — the PRD says "view," a table satisfies that; a future pass can
  add visualization if wanted.
- Editing/deleting events from this screen — read-only, matches how the rest of
  the app has no edit/delete anywhere.

## 1. Data model

No new tables, no migration, no new `EventType`/`EntityType` values. This
project is pure aggregation over existing data:
- `events` (already has `event_date`, `entity_type`, `entity_id`, `event_type`,
  `amount`)
- `animals` (already has `type: 'pig' | 'goat'`, needed to route an
  `entity_type: 'animal'` event into the Pigs or Goats bucket)
- `batches` (already has `purchase_cost` and `purchase_date` — a cost that
  lives on the batch record itself, not as an `expense` event; see the batch
  purchase cost rule below)

## 2. `aggregateProfitability` — pure function

**File:** `src/features/dashboard/aggregate.ts`

```ts
import type { LocalEvent, LocalAnimal, LocalBatch } from '../../lib/db';

export interface Bucket {
  label: string;
  cost: number;
  revenue: number;
  profit: number;
}

export interface ProfitabilityResult {
  buckets: Bucket[];
  overall: Bucket;
}

export function aggregateProfitability(
  events: LocalEvent[],
  animals: LocalAnimal[],
  batches: LocalBatch[],
  from: string,
  to: string
): ProfitabilityResult;
```

Always returns exactly 5 buckets, in this fixed order and with these fixed
labels: `Pigs`, `Goats`, `Batches`, `Plots`, `Farm-wide`.

**Event routing** (only events with `from <= event_date <= to` are considered;
`event_date` strings are `YYYY-MM-DD` so plain string comparison is correct,
matching how the rest of the app already compares/stores these):
- `entity_type === 'farm'` → `Farm-wide`
- `entity_type === 'plot'` → `Plots`
- `entity_type === 'batch'` → `Batches`
- `entity_type === 'animal'` → look up `entity_id` in a `Map` built from
  `animals` (by `id`); `type === 'pig'` → `Pigs`, `type === 'goat'` → `Goats`.
  If the animal isn't found (shouldn't happen — defensive only), skip the
  event rather than throwing.

For each routed event: `event_type === 'expense'` adds `amount` (or 0 if
`amount` is null) to that bucket's `cost`; `event_type === 'sale'` adds it to
`revenue`. Every other `event_type` (`feeding`, `vaccination`, `planting`,
`input_application`, etc.) doesn't affect cost/revenue and is ignored here —
this dashboard is a financial view, not an activity log.

**Batch purchase cost rule:** separately from event routing, iterate `batches`
and, for each batch whose `purchase_date` falls within `[from, to]` (same
string-comparison rule), add its `purchase_cost` (treating null as 0) to the
`Batches` bucket's `cost`. This means a batch purchased outside the selected
range contributes nothing from its purchase — consistent with treating the
purchase like any other dated cost, so a range's totals only ever include
costs that actually happened in that window (rather than `BatchDetail`'s
existing range-less calculation, which always includes it).

**Totals:** each bucket's `profit = revenue - cost`. `overall` is a `Bucket`
with `label: 'Overall'` and `cost`/`revenue`/`profit` summed across all 5
buckets.

## 3. `ProfitabilityDashboard.tsx` — screen

**File:** `src/features/dashboard/ProfitabilityDashboard.tsx`

- Two date inputs (`from`, `to`), same `<input type="date">` pattern
  `EventForm` already uses. Default: `from` = the 1st of the current month,
  `to` = today (both computed once on mount via `useState(() => ...)`,
  matching `EventForm`'s existing `useState(() => new Date().toISOString()...)`
  pattern for defaulting a date field).
- Data fetching via `useLiveQuery`, re-running whenever `from`/`to` change:
  - `db.events.where('event_date').between(from, to, true, true).toArray()`
    (inclusive on both ends — this is why `between`'s third/fourth args are
    both `true`)
  - `db.animals.toArray()`
  - `db.batches.toArray()`
- Calls `aggregateProfitability(events, animals, batches, from, to)`.
- Renders:
  - An overall summary line: `Cost: {overall.cost.toFixed(2)} — Revenue:
    {overall.revenue.toFixed(2)} — Profit: {overall.profit.toFixed(2)}`
  - A table with one row per bucket (label, cost, revenue, profit, each
    `.toFixed(2)`), always all 5 rows regardless of whether a bucket has any
    activity in range — a predictable, unsurprising table beats one that
    reshuffles rows as data changes.

No loading-state complexity is needed beyond `useLiveQuery`'s normal
`undefined`-while-pending behavior (guard with `?? []` when calling
`aggregateProfitability`, same as `PlotDetail`/`BatchDetail` already do for
their history lists) — there's no "not found" case here, since this screen has
no entity to look up by id.

## 4. Routing and navigation

`src/routes.tsx` gains `/dashboard` → `ProfitabilityDashboard`. `src/App.tsx`'s
nav gains a "Dashboard" link alongside the existing Animals/Batches/Plots/Farm
links.

## 5. Testing

- `aggregate.test.ts` — the bulk of coverage, as plain-array unit tests (no
  Dexie/React needed, which is the whole point of extracting this as a pure
  function):
  - An expense/sale event exactly on the `from` boundary and exactly on the
    `to` boundary are both included; one day outside either boundary is
    excluded.
  - A pig `expense` event routes to `Pigs`, a goat `expense` event routes to
    `Goats`, using the `animals` array to resolve `type`.
  - A `batch`/`plot`/`farm` event routes to `Batches`/`Plots`/`Farm-wide`
    respectively.
  - A non-expense/sale event (e.g. `feeding`, `input_application`) in range
    contributes nothing to cost/revenue.
  - A batch's `purchase_cost` is included in `Batches.cost` when
    `purchase_date` is in range, and excluded when it's outside the range.
  - `overall` correctly sums all 5 buckets' cost/revenue/profit.
  - Empty `events`/`animals`/`batches` input → all 5 buckets and `overall` are
    zeroed out, not omitted.
- `ProfitabilityDashboard.test.tsx` — a couple of integration tests seeding
  real Dexie data (following `PlotDetail.test.tsx`'s `beforeEach`
  clear-tables pattern) confirming: the rendered overall line and table match
  expected totals for a realistic mixed-entity fixture, and changing the
  `from`/`to` inputs changes what's displayed (e.g. an event dated outside the
  new range disappears from the totals).

## 6. Error handling

No new failure modes — this is a read-only aggregation screen with no form
submission. `aggregateProfitability` is a total function (never throws) given
well-typed inputs; the defensive "skip if animal not found" case above is the
only guard needed.
