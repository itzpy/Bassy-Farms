# Design: Vaccination Due Reminders

**Status:** Approved
**Date:** 2026-09-04
**Builds on:** `docs/superpowers/specs/2026-08-31-farm-v1-design.md` (`vaccination` `EventType`, `events.metadata`
jsonb pattern), `docs/superpowers/specs/2026-09-03-profitability-dashboard-design.md` (established the
pure-function + thin-component split this project reuses)

## Scope

This is the first slice of `farm-prd.md`'s V3 "reminders/notifications (e.g. vaccination due)" —
deliberately scoped to just that example, not a general-purpose reminder system. The
`vaccination` `EventType` already exists but has zero dedicated fields (just date +
free-text notes), so there is currently no way for the app to know a vaccination is
"due" at all. This project adds that.

**Out of scope:**
- Real push notifications — no backend push infrastructure exists (no VAPID keys, no
  server component to schedule/send), and doesn't fit the current architecture (a
  static-hosted PWA with a thin API-key-gated Supabase backend, no server-side logic
  beyond storage). An in-app banner, shown when the farmer opens the app (which they
  already do regularly to log events), covers the actual need.
- Generalizing "next due date" to other event types (e.g. a health-check follow-up) —
  the PRD's stated example is vaccinations; building for a hypothetical future need
  now would be speculative.
- Auto-computed due dates from a fixed vaccination schedule — the due date is
  whatever the vet/product label says, entered manually per vaccination, since the
  app has no concept of a farm-specific or vaccine-specific schedule and inventing
  one would bake in unverified assumptions.
- Editing/clearing a `next_due_date` after the fact — matches the rest of the app's
  no-edit/no-delete convention.
- Denormalizing due-vaccination status onto the `Animal` record — see section 2;
  it's computed from events at read time instead, consistent with how headcount and
  profitability are already computed elsewhere in this app.

## 1. `EventForm` — new field

**File:** `src/features/events/EventForm.tsx`

When `eventType === 'vaccination'`, show one new optional field: "Next due date"
(`<input type="date">`), stored as `metadata.next_due_date: string` (plain
`YYYY-MM-DD`, matching every other date field in this app — no new type). Left
blank, no value is stored and no reminder is ever tracked for that vaccination.
This follows the exact conditional-field pattern already established for
`showFeedFields`/`showInputFields` — a new `showVaccinationDueField = eventType
=== 'vaccination'` boolean, one new state variable (`nextDueDate`), and one new
branch in `buildMetadata()`.

## 2. `getDueVaccinations` — pure function

**File:** `src/features/reminders/dueVaccinations.ts`

```ts
import type { LocalEvent, LocalAnimal } from '../../lib/db';

export interface DueVaccination {
  animalId: string;
  tag: string;
  dueDate: string;
}

export function getDueVaccinations(
  events: LocalEvent[],
  animals: LocalAnimal[],
  today: string
): DueVaccination[];
```

Why computed, not stored: this app consistently derives entity status from the
event log at read time rather than denormalizing onto the entity record —
`BatchDetail` computes headcount and profit from `batches.events` on every
render rather than maintaining a running total on the `Batch` row. Vaccination
due-status follows the same rule: a `next_vaccination_due` field on `Animal`
would require every vaccination-event write to also update the animal record in
lockstep (a two-write consistency problem this app has never needed to solve
elsewhere), for a computation that's cheap to do at read time given this app's
scale (one farm, not thousands of animals).

**Algorithm:**
1. Filter `events` to `event_type === 'vaccination'`.
2. Group by `entity_id`, keep only the one with the latest `event_date` per
   animal (a newer vaccination's due date supersedes an older one — an animal
   vaccinated again resets the clock, regardless of whether the new event even
   has a `next_due_date` itself).
3. For each animal's latest vaccination event: skip if `metadata.next_due_date`
   is absent, skip if the animal's `status !== 'active'` (a sold or deceased
   animal isn't getting vaccinated), skip if `next_due_date > today`.
4. Return the survivors as `{ animalId, tag, dueDate: next_due_date }`, sorted
   by `dueDate` ascending (most overdue first).

## 3. `VaccinationReminders` — global banner

**File:** `src/features/reminders/VaccinationReminders.tsx`

Same shape as `src/components/UnsyncedIndicator.tsx`: `useLiveQuery` fetches
`db.events` (filtered to `event_type === 'vaccination'`, via
`.where('event_type').equals('vaccination')`) and `db.animals`, calls
`getDueVaccinations(events, animals, today)`, and renders `null` if the result
is empty (`if (dueVaccinations.length === 0) return null`, mirroring
`UnsyncedIndicator`'s `if (!count) return null`). Otherwise renders:
- A one-line summary: `{n} vaccination{s} due`
- A list, one line per animal: `{tag} — due {dueDate}`, each wrapped in a
  `<Link to={/animals/${animalId}}>` (react-router, same import already used
  throughout `App.tsx`/`routes.tsx`).

Mounted once in `src/App.tsx`, directly alongside the existing
`<UnsyncedIndicator />`, so it's visible from every screen regardless of which
part of the app the farmer is currently in — this is farm-wide information, not
scoped to the Animals screen.

## 4. `AnimalDetail` history line

**File:** `src/features/animals/AnimalDetail.tsx`

When a `vaccination` event's `metadata.next_due_date` is set, its history line
gains `— next due {date}`, following the exact graceful-omission convention
already used by `formatFeedDetail`/`formatBatchDetail`/`formatInputDetail` (a
small formatter function returning `''` when there's nothing to show, the
caller appending `${detail ? ' — ' + detail : ''}`).

## 5. Testing

- `getDueVaccinations` (pure function, plain-array unit tests, no Dexie): an
  animal's latest vaccination (by `event_date`) is the one that counts, not an
  earlier one with a different `next_due_date`; a vaccination with no
  `next_due_date` is excluded; a `next_due_date` in the future is excluded; a
  `next_due_date` exactly today or in the past is included; an inactive
  (`sold`/`deceased`) animal is excluded even with a past-due date; results are
  sorted by `dueDate` ascending; empty input returns an empty array.
- `EventForm` — the "Next due date" field shows only for `eventType ===
  'vaccination'`, and round-trips through `createEvent` into
  `metadata.next_due_date` correctly; blank leaves it absent from metadata
  (matching how every other optional field in `buildMetadata()` already
  behaves).
- `VaccinationReminders` — component test seeding real Dexie data (following
  `UnsyncedIndicator`'s/`PlotDetail`'s existing patterns): renders nothing when
  no vaccination is due; renders the summary + list when one is; a link
  navigates to the correct animal.
- `AnimalDetail` — a vaccination event with `next_due_date` shows the detail in
  history; one without shows a plain history line (no dangling `— next due`
  suffix), matching the existing test style in `PlotDetail.test.tsx`'s
  input-application-detail test.

## 6. Error handling

No new failure modes. `getDueVaccinations` is a total function (never throws)
given well-typed inputs — no animal record is assumed to exist for every event
edge case; a vaccination event whose animal has since been removed (shouldn't
happen — no delete exists anywhere in this app) would simply have no matching
`LocalAnimal`, and grouping naturally skips it since there's nothing to check
`status` against. `EventForm`'s existing submit/error-handling machinery is
unchanged.
