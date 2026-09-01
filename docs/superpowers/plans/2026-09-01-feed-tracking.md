# Feed Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add species-appropriate feed tracking to the existing Animals slice — pig feeding by development stage (starter/grower/finisher), goat feeding by free-text feed type — per `docs/superpowers/specs/2026-09-01-feed-tracking-design.md`.

**Architecture:** Extends the existing generic events model (no new tables). Adds a nullable `stage` field to `animals` (pigs only), and a documented `{ feed_type, quantity_kg }` shape inside the existing `events.metadata` jsonb column for `feeding` events.

**Tech Stack:** Same as the rest of the app — React, TypeScript, Dexie, Supabase, Vitest, React Testing Library.

---

## IMPORTANT process notes (carried over from the V1 foundation plan)

- **Always verify TypeScript with `npx tsc -b --noEmit`**, never bare `npx tsc --noEmit` — the latter silently checks zero files in this project due to the root `tsconfig.json`'s project-references setup.
- **`Animal.stage` is typed as OPTIONAL** (`stage?: PigStage | null`), not required-but-nullable like `birth_date`. This is a deliberate deviation from the design spec's literal wording ("Animal.stage: PigStage | null added") — making it optional means the ~6 existing test fixtures across `sync.test.ts`, `UnsyncedIndicator.test.tsx`, and `AnimalDetail.test.tsx` that construct `LocalAnimal` object literals directly (without going through `createAnimal`) do NOT need to be touched, since they simply won't have a `stage` property and that's valid. Only new code (Task 2's `createAnimal`) needs to set it explicitly.
- **No Dexie version bump is needed.** Dexie's `.stores()` calls only declare *indexed* keyPaths — arbitrary additional (non-indexed) properties can be stored on an object without a schema/version change. Since `stage` isn't being indexed (nothing queries/filters by it in this pass), the existing `version(2)` schema in `src/lib/db.ts` already accepts it with zero changes to that file.

---

## File structure this plan touches

```
supabase/migrations/0002_add_pig_stage.sql   (new)
src/lib/types.ts                              (modify)
src/features/animals/api.ts                   (modify)
src/features/animals/api.test.ts              (modify)
src/features/events/EventForm.tsx             (modify)
src/features/events/EventForm.test.tsx        (new)
src/features/animals/AnimalDetail.tsx         (modify)
src/features/animals/AnimalDetail.test.tsx    (modify)
```

---

### Task 1: Data model — types and Supabase migration

**Files:**
- Create: `supabase/migrations/0002_add_pig_stage.sql`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Write the migration**

`supabase/migrations/0002_add_pig_stage.sql`:
```sql
alter table animals
  add column stage text check (stage in ('starter', 'grower', 'finisher'));
```

- [ ] **Step 2: Add the `PigStage` type and `stage` field to `Animal`**

In `src/lib/types.ts`, add this line right after `export type AnimalStatus = 'active' | 'sold' | 'deceased';` (line 2):
```ts
export type PigStage = 'starter' | 'grower' | 'finisher';
```

Then modify the `Animal` interface (currently lines 4-13) to add `stage` as an **optional** field, right after `status`:
```ts
export interface Animal {
  id: string;
  type: AnimalType;
  tag: string;
  birth_date: string | null;
  status: AnimalStatus;
  stage?: PigStage | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc -b --noEmit`
Expected: exits 0. (This won't yet break anything — `stage` is optional, so no existing code that omits it becomes invalid.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_add_pig_stage.sql src/lib/types.ts
git commit -m "feat: add pig stage field to schema and types"
```

**Note for the human running this plan:** apply `0002_add_pig_stage.sql` to your Supabase project (SQL editor or CLI) — same as `0001_init.sql` was applied during initial setup.

---

### Task 2: Animals API — `updateAnimalStage`

**Files:**
- Modify: `src/features/animals/api.ts`, `src/features/animals/api.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/features/animals/api.test.ts` (inside the existing `describe('animals api', ...)` block, after the `updateAnimalStatus` test):
```ts
  it('updateAnimalStage sets the stage and marks unsynced', async () => {
    const id = await createAnimal({ type: 'pig', tag: 'P-02', birth_date: null, notes: null });
    await db.animals.update(id, { synced: 1 });

    await updateAnimalStage(id, 'grower');

    const stored = await db.animals.get(id);
    expect(stored).toMatchObject({ stage: 'grower', synced: 0 });
  });
```

Update the import line at the top of the file from:
```ts
import { createAnimal, updateAnimalStatus } from './api';
```
to:
```ts
import { createAnimal, updateAnimalStatus, updateAnimalStage } from './api';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- features/animals/api.test.ts`
Expected: FAIL — `updateAnimalStage` is not exported from `./api`.

- [ ] **Step 3: Implement `updateAnimalStage`, and set `stage: null` on creation**

In `src/features/animals/api.ts`:

Add `PigStage` to the existing type-only import (currently `import type { AnimalType, AnimalStatus } from '../../lib/types';`):
```ts
import type { AnimalType, AnimalStatus, PigStage } from '../../lib/types';
```

In `createAnimal`, add `stage: null,` to the object passed to `db.animals.put` — right after the `status: 'active',` line:
```ts
export async function createAnimal(input: NewAnimalInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.animals.put({
    id,
    type: input.type,
    tag: input.tag,
    birth_date: input.birth_date,
    status: 'active',
    stage: null,
    notes: input.notes,
    created_at: now,
    updated_at: now,
    synced: 0,
  });
  return id;
}
```

Add the new function after `updateAnimalStatus`:
```ts
export async function updateAnimalStage(id: string, stage: PigStage): Promise<void> {
  await db.animals.update(id, { stage, updated_at: new Date().toISOString(), synced: 0 });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- features/animals/api.test.ts`
Expected: PASS, 3 tests passed (the 2 existing plus the new one).

- [ ] **Step 5: Verify no new type errors**

Run: `npx tsc -b --noEmit`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/features/animals/api.ts src/features/animals/api.test.ts
git commit -m "feat: add updateAnimalStage to animals data layer"
```

---

### Task 3: EventForm — feed type and quantity fields

**Files:**
- Modify: `src/features/events/EventForm.tsx`
- Create: `src/features/events/EventForm.test.tsx`

This is the first component test for `EventForm` — it didn't have one before (a gap noted in an earlier code review). Write it before modifying the component (TDD), even though `EventForm` already exists — the tests below cover both the pre-existing behavior (so a regression would be caught) and the new feed-field behavior.

- [ ] **Step 1: Write the failing tests**

`src/features/events/EventForm.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '../../lib/db';
import { EventForm } from './EventForm';

describe('EventForm', () => {
  beforeEach(async () => {
    await db.events.clear();
  });

  it('logs a plain event with no feed fields when animalType is not given', async () => {
    const user = userEvent.setup();
    render(<EventForm entityType="animal" entityId="a1" />);

    expect(screen.queryByLabelText(/feed type/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /log event/i }));

    const events = await db.events.where('entity_id').equals('a1').toArray();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event_type: 'feeding', metadata: {} });
  });

  it('shows a stage dropdown defaulted to pigStage for a pig feeding, and stores feed_type/quantity_kg', async () => {
    const user = userEvent.setup();
    render(<EventForm entityType="animal" entityId="a2" animalType="pig" pigStage="grower" />);

    const feedTypeSelect = screen.getByLabelText(/feed type/i);
    expect(feedTypeSelect).toHaveValue('grower');

    await user.selectOptions(feedTypeSelect, 'finisher');
    await user.type(screen.getByLabelText(/quantity/i), '5');
    await user.click(screen.getByRole('button', { name: /log event/i }));

    const events = await db.events.where('entity_id').equals('a2').toArray();
    expect(events).toHaveLength(1);
    expect(events[0].metadata).toMatchObject({ feed_type: 'finisher', quantity_kg: 5 });
  });

  it('shows a free-text feed type input for a goat feeding, and stores it', async () => {
    const user = userEvent.setup();
    render(<EventForm entityType="animal" entityId="a3" animalType="goat" />);

    const feedTypeInput = screen.getByLabelText(/feed type/i);
    expect(feedTypeInput).toHaveValue('');

    await user.type(feedTypeInput, 'Hay');
    await user.type(screen.getByLabelText(/quantity/i), '2.5');
    await user.click(screen.getByRole('button', { name: /log event/i }));

    const events = await db.events.where('entity_id').equals('a3').toArray();
    expect(events).toHaveLength(1);
    expect(events[0].metadata).toMatchObject({ feed_type: 'Hay', quantity_kg: 2.5 });
  });

  it('does not show feed fields for a non-feeding event type', async () => {
    const user = userEvent.setup();
    render(<EventForm entityType="animal" entityId="a4" animalType="pig" pigStage="starter" />);

    await user.selectOptions(screen.getByLabelText(/event/i), 'vaccination');

    expect(screen.queryByLabelText(/feed type/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- features/events/EventForm.test.tsx`
Expected: the first test (no feed fields, plain event) passes as-is since it matches current behavior. The other three FAIL — `feed type`/`quantity` labels don't exist yet, `animalType`/`pigStage` props aren't accepted (TypeScript will also flag the unknown props once you run `tsc`, but the test failure itself will be about missing form elements).

- [ ] **Step 3: Implement the feed fields**

Replace the full contents of `src/features/events/EventForm.tsx` with:
```tsx
import { useState, type FormEvent } from 'react';
import type { AnimalType, EntityType, EventType, PigStage } from '../../lib/types';
import { createEvent } from './api';

const ANIMAL_EVENT_TYPES: EventType[] = [
  'feeding', 'vaccination', 'weight', 'health_check', 'breeding', 'death', 'expense', 'sale',
];

const PIG_STAGES: PigStage[] = ['starter', 'grower', 'finisher'];

export function EventForm({
  entityType,
  entityId,
  animalType,
  pigStage,
  onCreated,
}: {
  entityType: EntityType;
  entityId: string;
  animalType?: AnimalType;
  pigStage?: PigStage | null;
  onCreated?: () => void;
}) {
  const [eventType, setEventType] = useState<EventType>('feeding');
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [feedType, setFeedType] = useState(() => (animalType === 'pig' ? pigStage ?? 'starter' : ''));
  const [quantityKg, setQuantityKg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showFeedFields = eventType === 'feeding' && (animalType === 'pig' || animalType === 'goat');

  function buildMetadata(): Record<string, unknown> {
    if (!showFeedFields) return {};
    const metadata: Record<string, unknown> = {};
    if (feedType.trim()) metadata.feed_type = feedType.trim();
    if (quantityKg.trim()) metadata.quantity_kg = Number(quantityKg);
    return metadata;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await createEvent({
        event_type: eventType,
        entity_type: entityType,
        entity_id: entityId,
        event_date: eventDate,
        amount: null,
        category: null,
        notes: notes.trim() || null,
        metadata: buildMetadata(),
      });
      setNotes('');
      setQuantityKg('');
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log event');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="event-type">Event</label>
      <select id="event-type" value={eventType} onChange={(e) => setEventType(e.target.value as EventType)}>
        {ANIMAL_EVENT_TYPES.map((type) => (
          <option key={type} value={type}>{type}</option>
        ))}
      </select>

      <label htmlFor="event-date">Date</label>
      <input id="event-date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />

      {showFeedFields && animalType === 'pig' && (
        <>
          <label htmlFor="feed-type">Feed type</label>
          <select id="feed-type" value={feedType} onChange={(e) => setFeedType(e.target.value)}>
            {PIG_STAGES.map((stage) => (
              <option key={stage} value={stage}>{stage}</option>
            ))}
          </select>
        </>
      )}

      {showFeedFields && animalType === 'goat' && (
        <>
          <label htmlFor="feed-type">Feed type</label>
          <input id="feed-type" value={feedType} onChange={(e) => setFeedType(e.target.value)} />
        </>
      )}

      {showFeedFields && (
        <>
          <label htmlFor="feed-quantity">Quantity (kg)</label>
          <input
            id="feed-quantity"
            type="number"
            min="0"
            step="0.1"
            value={quantityKg}
            onChange={(e) => setQuantityKg(e.target.value)}
          />
        </>
      )}

      <label htmlFor="event-notes">Notes</label>
      <input id="event-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />

      {error && <p role="alert">{error}</p>}

      <button type="submit" disabled={isSubmitting}>Log event</button>
    </form>
  );
}
```

**Design notes for whoever reads this later:**
- `feedType`'s initial state is computed once from `pigStage` at mount — it does not auto-update if `pigStage` changes later while the form stays mounted (e.g., you update the pig's stage via `AnimalDetail`'s control in the same session). This is intentional: auto-overwriting a field the user may have already changed would be a worse UX footgun than requiring a manual re-select in the rare case someone updates stage and logs a feeding in the same sitting.
- After a successful submit, `notes` and `quantityKg` reset to empty, but `feedType` is deliberately NOT reset — consecutive feedings are usually the same stage/feed type, so keeping the selection saves a re-pick.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- features/events/EventForm.test.tsx`
Expected: PASS, 4 tests passed.

- [ ] **Step 5: Run the full suite and verify no new type errors**

Run: `npm run test`
Expected: PASS, all tests passed (existing 14 + 4 new = 18, though `AnimalDetail.tsx` still calls `<EventForm entityType="animal" entityId={animal.id} />` without the new props at this point in the plan — that's fine, they're optional, so this compiles and passes without Task 4).

Run: `npx tsc -b --noEmit`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/features/events/EventForm.tsx src/features/events/EventForm.test.tsx
git commit -m "feat: add feed type and quantity fields to EventForm for pig/goat feeding"
```

---

### Task 4: AnimalDetail — stage control, EventForm wiring, history formatting

**Files:**
- Modify: `src/features/animals/AnimalDetail.tsx`, `src/features/animals/AnimalDetail.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `src/features/animals/AnimalDetail.test.tsx` (inside the existing `describe('AnimalDetail', ...)` block, after the existing two tests):
```tsx
  it('shows a stage control for a pig, defaulting to its current stage', async () => {
    await db.animals.put({
      id: 'a2',
      type: 'pig',
      tag: 'P-02',
      birth_date: null,
      status: 'active',
      stage: 'grower',
      notes: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      synced: 0,
    });

    renderAt('a2');

    const stageControl = await screen.findByLabelText(/stage/i);
    expect(stageControl).toHaveValue('grower');
  });

  it('does not show a stage control for a goat', async () => {
    await db.animals.put({
      id: 'a3',
      type: 'goat',
      tag: 'G-01',
      birth_date: null,
      status: 'active',
      notes: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      synced: 0,
    });

    renderAt('a3');

    await screen.findByText(/G-01/);
    expect(screen.queryByLabelText(/stage/i)).not.toBeInTheDocument();
  });

  it('shows feed detail in the history line for a feeding event with metadata', async () => {
    await db.animals.put({
      id: 'a4',
      type: 'pig',
      tag: 'P-04',
      birth_date: null,
      status: 'active',
      stage: 'starter',
      notes: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      synced: 0,
    });
    await db.events.put({
      id: 'e1',
      client_id: 'e1',
      event_type: 'feeding',
      entity_type: 'animal',
      entity_id: 'a4',
      event_date: '2026-01-05',
      amount: null,
      category: null,
      notes: null,
      metadata: { feed_type: 'starter', quantity_kg: 3 },
      created_at: '2026-01-05T00:00:00.000Z',
      updated_at: '2026-01-05T00:00:00.000Z',
      synced: 0,
    });

    renderAt('a4');

    expect(await screen.findByText(/starter, 3kg/)).toBeInTheDocument();
  });
```

Note: this file's imports (`describe, it, expect, beforeEach`, `render, screen`, `MemoryRouter, Routes, Route`, `db`, `AnimalDetail`) already cover everything these new tests need — no import changes required.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- features/animals/AnimalDetail.test.tsx`
Expected: the first two new tests FAIL (no stage control exists yet). The third FAILS (no feed detail shown in history).

- [ ] **Step 3: Implement the stage control, EventForm wiring, and history formatting**

Replace the full contents of `src/features/animals/AnimalDetail.tsx` with:
```tsx
import { useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LocalEvent } from '../../lib/db';
import type { PigStage } from '../../lib/types';
import { updateAnimalStage } from './api';
import { EventForm } from '../events/EventForm';

// `useLiveQuery` returns `undefined` both while the query is still pending AND
// once it has genuinely resolved to "no such row." Passing this sentinel as
// the default result lets us tell those two states apart: it's only ever
// returned before the query's first real resolution.
const PENDING = Symbol('pending');

function formatFeedDetail(event: LocalEvent): string {
  if (event.event_type !== 'feeding') return '';
  const feedType = typeof event.metadata.feed_type === 'string' ? event.metadata.feed_type : null;
  const quantity = typeof event.metadata.quantity_kg === 'number' ? event.metadata.quantity_kg : null;
  return [feedType, quantity != null ? `${quantity}kg` : null].filter(Boolean).join(', ');
}

export function AnimalDetail() {
  const { id } = useParams<{ id: string }>();

  const result = useLiveQuery(() => (id ? db.animals.get(id) : undefined), [id], PENDING);
  const loading = result === PENDING;
  const animal = loading ? undefined : result;
  const events = useLiveQuery(
    () =>
      id
        ? db.events
            .where('entity_id')
            .equals(id)
            .and((e) => e.entity_type === 'animal')
            .reverse()
            .sortBy('event_date')
        : [],
    [id]
  );

  if (loading) return <p>Loading…</p>;
  if (!animal) return <p>Animal not found.</p>;

  return (
    <div>
      <h1>{animal.tag} ({animal.type})</h1>
      <p>Status: {animal.status}</p>

      {animal.type === 'pig' && (
        <p>
          <label htmlFor="pig-stage">Stage</label>{' '}
          <select
            id="pig-stage"
            value={animal.stage ?? 'starter'}
            onChange={(e) => void updateAnimalStage(animal.id, e.target.value as PigStage)}
          >
            <option value="starter">starter</option>
            <option value="grower">grower</option>
            <option value="finisher">finisher</option>
          </select>
        </p>
      )}

      <h2>Log an event</h2>
      <EventForm
        entityType="animal"
        entityId={animal.id}
        animalType={animal.type}
        pigStage={animal.type === 'pig' ? animal.stage ?? null : null}
      />

      <h2>History</h2>
      <ul>
        {(events ?? []).map((event) => {
          const feedDetail = formatFeedDetail(event);
          return (
            <li key={event.id}>
              {event.event_date} — {event.event_type}
              {feedDetail ? ` — ${feedDetail}` : ''}
              {event.notes ? ` — ${event.notes}` : ''}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- features/animals/AnimalDetail.test.tsx`
Expected: PASS, 5 tests passed (the 2 existing plus the 3 new ones).

- [ ] **Step 5: Run the full suite and verify zero type errors**

Run: `npm run test`
Expected: PASS, all tests passed (18 from Task 3 + 3 new = 21).

Run: `npx tsc -b --noEmit`
Expected: exits 0.

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/features/animals/AnimalDetail.tsx src/features/animals/AnimalDetail.test.tsx
git commit -m "feat: add pig stage control and feed detail to AnimalDetail"
```

---

## Plan self-review notes

- **Spec coverage:** §1 (data model) → Task 1 (types, migration) and Task 2 (`createAnimal` sets `stage: null`). §2 (data layer) → Task 2. §3 (UI) → Task 3 (`EventForm`) and Task 4 (`AnimalDetail` stage control, prop wiring, history formatting). §4 (testing) → a test is written for every new/changed behavior in each task. §5 (error handling) → `updateAnimalStage` reuses the same Dexie-throws-and-propagates pattern as `updateAnimalStatus`; no new failure mode introduced.
- **Type consistency:** `PigStage` is defined once (Task 1, `types.ts`) and imported everywhere it's used (`api.ts`, `EventForm.tsx`, `AnimalDetail.tsx`) — no duplicate/divergent definitions. `stage` is consistently optional (`PigStage | null | undefined` in practice) across `Animal`, `LocalAnimal` (inherited), and every read site (`animal.stage ?? 'starter'` / `animal.stage ?? null`, both null-safe).
- **No placeholders:** every code block is complete and copy-pasteable; the one deliberately-manual step (Task 1's note to apply the migration to the live Supabase project) is called out explicitly, not left as a vague TODO.
- **Deviation from the spec's literal wording**, documented in the "IMPORTANT process notes" section up top: `stage` is optional rather than required-but-nullable, and no Dexie version bump is used — both are implementation-level simplifications that preserve the spec's actual intent (a nullable, pig-only field) while avoiding unnecessary churn to existing test fixtures and an unnecessary schema version bump.
