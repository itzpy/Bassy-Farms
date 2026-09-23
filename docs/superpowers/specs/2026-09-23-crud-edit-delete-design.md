# Design: Edit & Delete for Animals, Batches, Plots, and Events

**Status:** Approved
**Date:** 2026-09-23
**Builds on:** every prior design doc in this project — this is the first one to add
`update`/`delete` to entities that, until now, were create-only by explicit convention
(see e.g. `2026-09-04-vaccination-reminders-design.md`'s out-of-scope note: "matches the
rest of the app's no-edit/no-delete convention"). This doc changes that convention.

## Scope

Add edit and delete to all four record types the app lets a farmer create: Animals,
Batches, Plots, and Events (the highest-volume type, logged against any of the other
three or the farm itself).

**Out of scope:**
- A "trash" / restore UI for soft-deleted records. `deleted_at` makes restoration
  possible later without a schema change, but no UI is built for it now — YAGNI until
  someone actually needs to undo a delete.
- Bulk edit/delete (multi-select). Every interaction here is one record at a time,
  matching how the rest of the app already works (one form, one event, one entity).
- Field-level audit history (who changed what, when) beyond the existing
  `updated_at` bump. Single-user app; not needed.
- Changing `pushTable`/`pullTable` sync internals. Soft delete is deliberately designed
  to need zero changes there — see "Sync" below.

## Why soft delete, not hard delete

`src/lib/sync.ts`'s `pullTable` only ever adds/updates local rows for anything the
server reports with `updated_at` newer than the last pull cursor — it has no mechanism
to notice a row disappeared server-side, and no code path removes local rows at all.
A hard delete would therefore only ever remove the row on the device that performed it;
every other device keeps its local copy forever, and if that other device is offline
during the delete and later pushes an unrelated edit to that same row, the row would
reappear on the server (upsert re-creates it). Given this is an offline-first app where
edits can originate from a phone that's been offline for days, that failure mode is a
real risk, not a theoretical one.

Soft delete sidesteps this entirely: a delete is just another field update
(`deleted_at = now()`), which the existing push/pull machinery already handles
correctly — it syncs, propagates, and last-write-wins exactly like editing any other
field. No new sync code, no new failure mode.

## 1. Schema

**New Postgres migration:** `supabase/migrations/0006_add_deleted_at.sql`

```sql
alter table animals add column deleted_at timestamptz;
alter table plots add column deleted_at timestamptz;
alter table batches add column deleted_at timestamptz;
alter table events add column deleted_at timestamptz;
```

No RLS policy changes needed — the existing `for all using (user_id = auth.uid())`
policies already cover reads/writes of the new column.

This migration must be **applied to the live `bassy-farms` Supabase project before
this feature is deployed**, not just committed to the repo. `pushTable` in
`sync.ts` spreads every field of every unsynced local record into its `upsert()` call
(`const { synced, ...remoteRecord } = record`), so as soon as any client starts writing
a local `deleted_at` field — even `null` — every sync push for every table would fail
against a database that doesn't have the column yet.

**Local (Dexie):** no schema version bump needed. IndexedDB via Dexie doesn't enforce
object shape beyond declared indexes; `deleted_at` is added to the TypeScript types
(`Animal`, `Plot`, `Batch`, `FarmEvent` in `src/lib/types.ts`, each gaining
`deleted_at: string | null`) and used directly in `put`/`update` calls. It is not added
to any `.stores()` index definition — nothing needs to query by it via a Dexie index;
plain JS `.filter()` on the already-fetched array is consistent with how this codebase
already handles secondary conditions (e.g. `AnimalDetail`'s
`.and((e) => e.entity_type === 'animal')`).

## 2. API layer

Each `src/features/*/api.ts` gains an `updateX` and `deleteX` alongside its existing
`createX`. Pattern (shown for animals; batches/plots/events follow identically):

```ts
export async function updateAnimal(id: string, patch: Partial<NewAnimalInput>): Promise<void> {
  await db.animals.update(id, { ...patch, updated_at: new Date().toISOString(), synced: 0 });
}

export async function deleteAnimal(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.animals.update(id, { deleted_at: now, updated_at: now, synced: 0 });
}
```

`updateEvent` takes a `Partial<NewEventInput>` and, like `createEvent`, expects the
caller (the now edit-aware `EventForm`) to have already rebuilt `metadata` and `amount`
from the current field values — it doesn't merge metadata itself, it replaces it, same
as `createEvent` does today. `deleteEvent` follows the same shape as the others.

`updateAnimalStatus`/`updateAnimalStage` (existing, narrow single-field updaters) are
untouched — `updateAnimal` is a new, separate, broader updater for the full editable
field set (`type`, `tag`, `birth_date`, `notes`); status/stage keep their existing
dedicated call sites in `AnimalDetail`.

## 3. Read-side filtering

Every query that lists or aggregates records must exclude soft-deleted rows, **except**
a single entity fetched directly by id for its own detail page (see §4 — a deleted
entity's detail page must still render). Concretely, add `.filter((r) => !r.deleted_at)`
(or fold into an existing `.and(...)` predicate) to:

- `AnimalsList`, `PlotsList`, `BatchesList` — their list queries
- `ProfitabilityDashboard` — its underlying `events`/`animals`/`batches` queries, so a
  deleted batch's purchase cost and a deleted event's amount stop counting
- `VaccinationReminders` — its `events`/`animals` queries, so a deleted animal or a
  deleted vaccination event stops generating a reminder
- The event-history query inside `AnimalDetail`, `PlotDetail`, `BatchDetail`,
  `FarmEvents` — a deleted event must disappear from history immediately, on the same
  page where it was deleted and everywhere else

`db.animals.get(id)` / `db.plots.get(id)` / `db.batches.get(id)` (the single-record
fetch each detail page uses) are **not** filtered — see §4.

## 4. UI: Animals, Batches, Plots

Each `*Form` (`AnimalForm`, `PlotForm`, `BatchForm`) gains an optional prop:

```ts
editing?: Animal;   // or Plot / Batch
onSaved?: () => void;
```

When `editing` is set: initial state is seeded from the record instead of blank
defaults, the submit handler calls `updateX(editing.id, {...})` instead of `createX`,
`onSaved` fires instead of `onCreated`, and the submit button reads "Save changes" with
an adjacent "Cancel" button (calling `onSaved` immediately without saving — reusing the
same callback to collapse back to read-only view either way). The list pages'
"Add a new one" usage of these forms is unaffected — `editing` simply isn't passed
there.

Each Detail page (`AnimalDetail`, `PlotDetail`, `BatchDetail`) adds local
`isEditing` state:

- Not editing, not deleted: read-only summary (as today) + "Edit" and "Delete" buttons.
- Editing: the `*Form` in edit mode replaces the read-only summary.
- "Delete": `window.confirm('Delete <name>? This cannot be undone from the app.')`,
  then `deleteX(id)`, then `useNavigate()` back to that entity's list route
  (`/animals`, `/plots`, `/batches`). A native `confirm()` is used deliberately —
  no modal component exists anywhere in this app, and introducing one for a single
  yes/no gate would be disproportionate.
- Deleted (`entity.deleted_at` is set): render a "Deleted" notice in place of the
  Edit/Delete/Log-an-event controls; the event history section remains visible and
  unfiltered-by-deletion (it's already just that entity's own event history — nothing
  new to filter). This is reachable only via a direct link/bookmark, since the list
  pages exclude deleted entities (§3).

## 5. UI: Events

Events have no detail page of their own — they're always rendered as an entry in some
other page's history list. Four pages currently duplicate near-identical
history-rendering code: `AnimalDetail`, `PlotDetail`, `BatchDetail`, `FarmEvents`, each
with its own tiny per-event detail formatter (`formatFeedDetail`/`formatVaccinationDetail`,
`formatInputDetail`, `formatBatchDetail`, none respectively).

**New shared component:** `src/features/events/EventHistoryList.tsx`

```ts
export function EventHistoryList({
  events,
  entityType,
  entityId,
  animalType,
  pigStage,
  formatDetail,
}: {
  events: LocalEvent[];
  entityType: EntityType;
  entityId: string | null;
  animalType?: AnimalType;
  pigStage?: PigStage | null;
  formatDetail?: (event: LocalEvent) => string;
}): JSX.Element
```

It owns one piece of state: which event id (if any) is currently being edited. For each
event it renders either:
- The existing plain history line (date — type — detail — amount — notes) plus "Edit"
  and "Delete" buttons, or
- In place of that line, when this event is the one being edited: `<EventForm
  entityType entityId animalType pigStage editingEvent={event} onSaved={...
  collapses back to plain line} onCancel={... same} />`

"Delete" follows the same `window.confirm` + call + done pattern as §4, calling
`deleteEvent(id)` (no navigation needed — the row just disappears from the live-queried
list).

Each of the four call sites replaces its own `<ul>{...}</ul>` history block with
`<EventHistoryList events={...} entityType="animal" entityId={animal.id}
animalType={animal.type} pigStage={...} formatDetail={formatFeedOrVaccinationDetail} />`
(and similarly for the other three, each passing its own existing formatter, combined
into one function where a page has more than one, e.g. `AnimalDetail` combining its feed
and vaccination formatters into one `formatDetail` that tries each in turn). This is a
net reduction in duplicated code, not just new code — the four separate `<ul>{...map...}</ul>`
blocks collapse into one shared component.

**`EventForm` changes:** two new optional props, `editingEvent?: LocalEvent | null` and
`onCancel?: () => void` (alongside the existing `onCreated`, which continues to mean
"create succeeded"; a new `onSaved?: () => void` is used for "edit succeeded" so a
caller rendering the form in both modes over time can tell which happened if it cares,
though `EventHistoryList` treats them identically — both collapse the row).

When `EventHistoryList` mounts an `<EventForm>` for editing, it does so keyed by
`editingEvent.id` (`key={event.id}`) and only while that row is being edited — the
component is freshly mounted each time editing starts, so every existing `useState(() =>
...)` lazy initializer can read from `editingEvent` directly with no `useEffect`
re-sync logic needed. Concretely, each field's initializer becomes e.g.
`useState(() => editingEvent?.event_date ?? new Date().toISOString().slice(0, 10))`,
metadata fields read from `editingEvent?.metadata`, and `eventType`/`amount`/`notes`
read from the corresponding top-level fields — all with the same "fall back to today's
create-mode default" pattern already used for `eventDate`.

`handleSubmit` branches on whether `editingEvent` is set: if so, call
`updateEvent(editingEvent.id, { event_type, event_date, amount: buildAmount(), category:
null, notes, metadata: buildMetadata() })` and call `onSaved?.()` (skipping the
field-reset-for-next-entry logic, which only makes sense in create mode); otherwise the
existing `createEvent` path, unchanged. The submit button reads "Save changes" instead
of "Log event" when editing, with a "Cancel" button calling `onCancel?.()`.

## 6. Testing

- `updateAnimal`/`deleteAnimal` (and the batch/plot/event equivalents): a normal field
  update persists and bumps `updated_at`/clears `synced`; delete sets `deleted_at` and
  also bumps `updated_at`/clears `synced`.
- `AnimalForm`/`PlotForm`/`BatchForm` in edit mode: pre-fills from the given record;
  submitting calls the update path (not create) and reflects the new values; Cancel
  discards changes without calling update.
- Detail pages: Edit button toggles the form in; Delete triggers `confirm`, and — only
  when confirmed — deletes and navigates to the list; a deleted entity's detail page
  renders the "Deleted" notice with no Edit/Delete/Log-event controls but full history
  still visible.
- `EventHistoryList`: renders Edit/Delete per row; Edit swaps exactly one row into an
  `EventForm` pre-filled from that event, leaving sibling rows untouched; saving an edit
  updates that row's rendered text; Delete removes the row from the live list.
- Filtering: a deleted animal disappears from `AnimalsList` but its own detail page still
  loads; a deleted event disappears from its parent's history *and* from the
  profitability dashboard's totals *and* stops being eligible for a vaccination
  reminder (each existing test suite for those gets one new soft-delete case rather than
  a new file).

## 7. Error handling

No new failure modes beyond what `createAnimal`/`createEvent` etc. already have.
`updateX`/`deleteX` are thin wrappers around `db.table.update(id, patch)`, which is a
no-op if `id` doesn't exist (Dexie doesn't throw) — acceptable here since every call site
already holds a record it just read via `useLiveQuery`, so a missing id would only occur
from a genuine race (e.g. deleted from another tab a moment earlier), and silently doing
nothing is the correct behavior for that race, not an error to surface.
