# Edit & Delete (Animals, Batches, Plots, Events) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a farmer edit or soft-delete any Animal, Batch, Plot, or Event they've previously logged, syncing correctly across devices via the existing offline-first sync engine.

**Architecture:** A nullable `deleted_at` column (new Postgres migration) makes "delete" just another field update that flows through the existing push/pull sync unchanged — no new sync code. Each `features/*/api.ts` gains `updateX`/`deleteX` alongside its existing `createX`. Each `*Form` component gains an optional `editing` prop to double as its own edit form. A new shared `EventHistoryList` component (replacing four near-identical duplicated history-rendering blocks) adds inline Edit/Delete to every event row.

**Tech Stack:** React, TypeScript, Dexie (`dexie-react-hooks`), Supabase (Postgres + supabase-js), React Router, Vitest + Testing Library.

**Full design context:** `docs/superpowers/specs/2026-09-23-crud-edit-delete-design.md`

---

### Task 1: Schema — `deleted_at` column

**Files:**
- Create: `supabase/migrations/0006_add_deleted_at.sql`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0006_add_deleted_at.sql`:

```sql
alter table animals add column deleted_at timestamptz;
alter table plots add column deleted_at timestamptz;
alter table batches add column deleted_at timestamptz;
alter table events add column deleted_at timestamptz;
```

No RLS policy changes needed — the existing `for all using (user_id = auth.uid())`
policies on each table already cover the new column.

- [ ] **Step 2: Apply the migration to the live Supabase project**

This must happen before any client starts writing a local `deleted_at` field, because
`pushTable` in `src/lib/sync.ts` spreads every field of every unsynced record into its
`upsert()` call — a client with the new field but a database without the column would
fail to sync *any* record, not just deleted ones.

Apply it via the Supabase MCP `apply_migration` tool against project id
`mqigjuxprxgmytuuhebt`, with the exact SQL from Step 1. (If running this plan without
MCP access, apply the same SQL via the Supabase SQL editor or `supabase db push`
instead.)

- [ ] **Step 3: Add the field to local types**

In `src/lib/types.ts`, add one line to each of the four interfaces (placed after each
interface's existing `updated_at: string;` line):

```ts
export interface Animal {
  // ...existing fields...
  updated_at: string;
  deleted_at?: string | null;
}

export interface Plot {
  // ...existing fields...
  updated_at: string;
  deleted_at?: string | null;
}

export interface Batch {
  // ...existing fields...
  updated_at: string;
  deleted_at?: string | null;
}

export interface FarmEvent {
  // ...existing fields...
  updated_at: string;
  deleted_at?: string | null;
}
```

It's declared **optional** (`?`) deliberately: every existing `createX` call site and
every existing test fixture builds a full object literal for these types, and an
optional field doesn't require any of them to change. A record that's never been
deleted simply never has the key set (`undefined`), which reads as "not deleted"
everywhere this plan adds a `!record.deleted_at` filter.

No Dexie schema version bump is needed — IndexedDB via Dexie doesn't enforce object
shape beyond declared indexes, so a new non-indexed field works immediately.

- [ ] **Step 4: Verify the project still type-checks**

Run: `npx tsc -b --noEmit`
Expected: no errors (this change is purely additive/optional).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0006_add_deleted_at.sql src/lib/types.ts
git commit -m "feat: add deleted_at column for soft-delete support"
```

---

### Task 2: Animal API — `updateAnimal` / `deleteAnimal`

**Files:**
- Modify: `src/features/animals/api.ts`
- Test: `src/features/animals/api.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/features/animals/api.test.ts`, inside the existing `describe('animals api', ...)`
block, and update the import line to add `updateAnimal, deleteAnimal`:

```ts
import { createAnimal, updateAnimalStatus, updateAnimalStage, updateAnimal, deleteAnimal } from './api';
```

```ts
  it('updateAnimal patches given fields, bumps updated_at, and marks unsynced', async () => {
    const id = await createAnimal({ type: 'pig', tag: 'P-03', birth_date: null, notes: null });
    await db.animals.update(id, { synced: 1, updated_at: '2020-01-01T00:00:00.000Z' });

    await updateAnimal(id, { tag: 'P-03-renamed', type: 'goat' });

    const stored = await db.animals.get(id);
    expect(stored).toMatchObject({ tag: 'P-03-renamed', type: 'goat', synced: 0 });
    expect(stored!.updated_at).not.toBe('2020-01-01T00:00:00.000Z');
  });

  it('deleteAnimal sets deleted_at, bumps updated_at, and marks unsynced', async () => {
    const id = await createAnimal({ type: 'goat', tag: 'G-02', birth_date: null, notes: null });
    await db.animals.update(id, { synced: 1, updated_at: '2020-01-01T00:00:00.000Z' });

    await deleteAnimal(id);

    const stored = await db.animals.get(id);
    expect(stored!.deleted_at).toBeTruthy();
    expect(stored!.synced).toBe(0);
    expect(stored!.updated_at).not.toBe('2020-01-01T00:00:00.000Z');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/animals/api.test.ts`
Expected: FAIL — `updateAnimal`/`deleteAnimal` are not exported yet.

- [ ] **Step 3: Implement**

Add to `src/features/animals/api.ts`:

```ts
export async function updateAnimal(id: string, patch: Partial<NewAnimalInput>): Promise<void> {
  await db.animals.update(id, { ...patch, updated_at: new Date().toISOString(), synced: 0 });
}

export async function deleteAnimal(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.animals.update(id, { deleted_at: now, updated_at: now, synced: 0 });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/animals/api.test.ts`
Expected: PASS (all tests in the file, including the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/features/animals/api.ts src/features/animals/api.test.ts
git commit -m "feat: add updateAnimal/deleteAnimal"
```

---

### Task 3: Batch API — `updateBatch` / `deleteBatch`

**Files:**
- Modify: `src/features/batches/api.ts`
- Test: `src/features/batches/api.test.ts`

- [ ] **Step 1: Write the failing tests**

Update the import line in `src/features/batches/api.test.ts`:

```ts
import { createBatch, updateBatch, deleteBatch } from './api';
```

Add inside the existing `describe('batches api', ...)` block:

```ts
  it('updateBatch patches given fields, bumps updated_at, and marks unsynced', async () => {
    const id = await createBatch({
      name: 'Batch A', purchase_date: '2026-09-01', initial_count: 10, purchase_cost: 500, notes: null,
    });
    await db.batches.update(id, { synced: 1, updated_at: '2020-01-01T00:00:00.000Z' });

    await updateBatch(id, { name: 'Batch A renamed', initial_count: 12 });

    const stored = await db.batches.get(id);
    expect(stored).toMatchObject({ name: 'Batch A renamed', initial_count: 12, synced: 0 });
    expect(stored!.updated_at).not.toBe('2020-01-01T00:00:00.000Z');
  });

  it('deleteBatch sets deleted_at, bumps updated_at, and marks unsynced', async () => {
    const id = await createBatch({
      name: 'Batch B', purchase_date: '2026-09-01', initial_count: 5, purchase_cost: null, notes: null,
    });
    await db.batches.update(id, { synced: 1, updated_at: '2020-01-01T00:00:00.000Z' });

    await deleteBatch(id);

    const stored = await db.batches.get(id);
    expect(stored!.deleted_at).toBeTruthy();
    expect(stored!.synced).toBe(0);
    expect(stored!.updated_at).not.toBe('2020-01-01T00:00:00.000Z');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/batches/api.test.ts`
Expected: FAIL — `updateBatch`/`deleteBatch` are not exported yet.

- [ ] **Step 3: Implement**

Add to `src/features/batches/api.ts`:

```ts
export async function updateBatch(id: string, patch: Partial<NewBatchInput>): Promise<void> {
  await db.batches.update(id, { ...patch, updated_at: new Date().toISOString(), synced: 0 });
}

export async function deleteBatch(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.batches.update(id, { deleted_at: now, updated_at: now, synced: 0 });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/batches/api.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/batches/api.ts src/features/batches/api.test.ts
git commit -m "feat: add updateBatch/deleteBatch"
```

---

### Task 4: Plot API — `updatePlot` / `deletePlot`

**Files:**
- Modify: `src/features/plots/api.ts`
- Test: `src/features/plots/api.test.ts`

- [ ] **Step 1: Write the failing tests**

Update the import line in `src/features/plots/api.test.ts`:

```ts
import { createPlot, updatePlot, deletePlot } from './api';
```

Add inside the existing `describe('plots api', ...)` block:

```ts
  it('updatePlot patches given fields, bumps updated_at, and marks unsynced', async () => {
    const id = await createPlot({
      name: 'North Field', crop_type: 'Maize', planted_date: '2026-04-01', area: 2.5, notes: null,
    });
    await db.plots.update(id, { synced: 1, updated_at: '2020-01-01T00:00:00.000Z' });

    await updatePlot(id, { name: 'North Field renamed', area: 3 });

    const stored = await db.plots.get(id);
    expect(stored).toMatchObject({ name: 'North Field renamed', area: 3, synced: 0 });
    expect(stored!.updated_at).not.toBe('2020-01-01T00:00:00.000Z');
  });

  it('deletePlot sets deleted_at, bumps updated_at, and marks unsynced', async () => {
    const id = await createPlot({
      name: 'South Field', crop_type: null, planted_date: null, area: null, notes: null,
    });
    await db.plots.update(id, { synced: 1, updated_at: '2020-01-01T00:00:00.000Z' });

    await deletePlot(id);

    const stored = await db.plots.get(id);
    expect(stored!.deleted_at).toBeTruthy();
    expect(stored!.synced).toBe(0);
    expect(stored!.updated_at).not.toBe('2020-01-01T00:00:00.000Z');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/plots/api.test.ts`
Expected: FAIL — `updatePlot`/`deletePlot` are not exported yet.

- [ ] **Step 3: Implement**

Add to `src/features/plots/api.ts`:

```ts
export async function updatePlot(id: string, patch: Partial<NewPlotInput>): Promise<void> {
  await db.plots.update(id, { ...patch, updated_at: new Date().toISOString(), synced: 0 });
}

export async function deletePlot(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.plots.update(id, { deleted_at: now, updated_at: now, synced: 0 });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/plots/api.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/plots/api.ts src/features/plots/api.test.ts
git commit -m "feat: add updatePlot/deletePlot"
```

---

### Task 5: Event API — `updateEvent` / `deleteEvent`

**Files:**
- Modify: `src/features/events/api.ts`
- Test: `src/features/events/api.test.ts`

- [ ] **Step 1: Write the failing tests**

Update the import line in `src/features/events/api.test.ts`:

```ts
import { createEvent, updateEvent, deleteEvent } from './api';
```

Add inside the existing `describe('events api', ...)` block:

```ts
  it('updateEvent patches given fields, bumps updated_at, and marks unsynced', async () => {
    const id = await createEvent({
      event_type: 'feeding', entity_type: 'animal', entity_id: 'a1',
      event_date: '2026-08-31', amount: null, category: null, notes: 'Morning feed', metadata: {},
    });
    await db.events.update(id, { synced: 1, updated_at: '2020-01-01T00:00:00.000Z' });

    await updateEvent(id, {
      event_date: '2026-09-01', notes: 'Updated note', metadata: { feed_type: 'starter' },
    });

    const stored = await db.events.get(id);
    expect(stored).toMatchObject({
      event_date: '2026-09-01', notes: 'Updated note', metadata: { feed_type: 'starter' }, synced: 0,
    });
    expect(stored!.updated_at).not.toBe('2020-01-01T00:00:00.000Z');
  });

  it('deleteEvent sets deleted_at, bumps updated_at, and marks unsynced', async () => {
    const id = await createEvent({
      event_type: 'expense', entity_type: 'farm', entity_id: null,
      event_date: '2026-08-31', amount: 10, category: null, notes: null, metadata: {},
    });
    await db.events.update(id, { synced: 1, updated_at: '2020-01-01T00:00:00.000Z' });

    await deleteEvent(id);

    const stored = await db.events.get(id);
    expect(stored!.deleted_at).toBeTruthy();
    expect(stored!.synced).toBe(0);
    expect(stored!.updated_at).not.toBe('2020-01-01T00:00:00.000Z');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/events/api.test.ts`
Expected: FAIL — `updateEvent`/`deleteEvent` are not exported yet.

- [ ] **Step 3: Implement**

Add to `src/features/events/api.ts`:

```ts
export async function updateEvent(id: string, patch: Partial<NewEventInput>): Promise<void> {
  await db.events.update(id, { ...patch, updated_at: new Date().toISOString(), synced: 0 });
}

export async function deleteEvent(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.events.update(id, { deleted_at: now, updated_at: now, synced: 0 });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/events/api.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/events/api.ts src/features/events/api.test.ts
git commit -m "feat: add updateEvent/deleteEvent"
```

---

### Task 6: Filter soft-deleted records out of the list screens

**Files:**
- Modify: `src/features/animals/AnimalsList.tsx`
- Modify: `src/features/plots/PlotsList.tsx`
- Modify: `src/features/batches/BatchesList.tsx`
- Test: `src/features/animals/AnimalsList.test.tsx`
- Test: `src/features/plots/PlotsList.test.tsx`
- Test: `src/features/batches/BatchesList.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `src/features/animals/AnimalsList.test.tsx`, inside the existing `describe('AnimalsList', ...)` block:

```tsx
  it('does not show a deleted animal', async () => {
    await db.animals.put({
      id: 'a1', type: 'pig', tag: 'P-99', birth_date: null, status: 'active', notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
      deleted_at: '2026-01-02T00:00:00.000Z',
    });

    render(
      <MemoryRouter>
        <AnimalsList />
      </MemoryRouter>
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText('P-99')).not.toBeInTheDocument();
  });
```

Add to `src/features/plots/PlotsList.test.tsx`, inside the existing `describe('PlotsList', ...)` block:

```tsx
  it('does not show a deleted plot', async () => {
    await db.plots.put({
      id: 'p1', name: 'Deleted Field', crop_type: null, planted_date: null, area: null, notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
      deleted_at: '2026-01-02T00:00:00.000Z',
    });

    render(
      <MemoryRouter>
        <PlotsList />
      </MemoryRouter>
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText('Deleted Field')).not.toBeInTheDocument();
  });
```

Add to `src/features/batches/BatchesList.test.tsx`, inside the existing `describe('BatchesList', ...)` block:

```tsx
  it('does not show a deleted batch', async () => {
    await db.batches.put({
      id: 'b1', name: 'Deleted Batch', purchase_date: '2026-01-01', initial_count: 5, purchase_cost: null, notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
      deleted_at: '2026-01-02T00:00:00.000Z',
    });

    render(
      <MemoryRouter>
        <BatchesList />
      </MemoryRouter>
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText('Deleted Batch')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/animals/AnimalsList.test.tsx src/features/plots/PlotsList.test.tsx src/features/batches/BatchesList.test.tsx`
Expected: FAIL — all three deleted records currently still show.

- [ ] **Step 3: Implement**

In `src/features/animals/AnimalsList.tsx`, change the query:

```tsx
  const animals = useLiveQuery(
    () => db.animals.orderBy('tag').filter((a) => !a.deleted_at).toArray(),
    []
  );
```

In `src/features/plots/PlotsList.tsx`, change the query:

```tsx
  const plots = useLiveQuery(
    () => db.plots.orderBy('name').filter((p) => !p.deleted_at).toArray(),
    []
  );
```

In `src/features/batches/BatchesList.tsx`, change the query:

```tsx
  const batches = useLiveQuery(
    () => db.batches.orderBy('purchase_date').reverse().filter((b) => !b.deleted_at).toArray(),
    []
  );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/animals/AnimalsList.test.tsx src/features/plots/PlotsList.test.tsx src/features/batches/BatchesList.test.tsx`
Expected: PASS (all tests in each file, including the 3 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/features/animals/AnimalsList.tsx src/features/animals/AnimalsList.test.tsx src/features/plots/PlotsList.tsx src/features/plots/PlotsList.test.tsx src/features/batches/BatchesList.tsx src/features/batches/BatchesList.test.tsx
git commit -m "feat: hide soft-deleted records from list screens"
```

---

### Task 7: Filter soft-deleted records out of the dashboard and reminders

**Files:**
- Modify: `src/features/dashboard/ProfitabilityDashboard.tsx`
- Modify: `src/features/reminders/VaccinationReminders.tsx`
- Test: `src/features/dashboard/ProfitabilityDashboard.test.tsx`
- Test: `src/features/reminders/VaccinationReminders.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `src/features/dashboard/ProfitabilityDashboard.test.tsx`, inside the existing
`describe('ProfitabilityDashboard', ...)` block:

```tsx
  it('excludes a deleted event from totals', async () => {
    const today = new Date().toISOString().slice(0, 10);

    await db.events.put({
      id: 'e1', client_id: 'e1', event_type: 'expense', entity_type: 'farm', entity_id: null,
      event_date: today, amount: 999, category: null, notes: null, metadata: {},
      created_at: today + 'T00:00:00.000Z', updated_at: today + 'T00:00:00.000Z', synced: 0,
      deleted_at: today + 'T01:00:00.000Z',
    });

    render(<ProfitabilityDashboard />);

    expect(await screen.findByText(/Cost: 0\.00/)).toBeInTheDocument();
  });
```

Add to `src/features/reminders/VaccinationReminders.test.tsx`, inside the existing
`describe('VaccinationReminders', ...)` block:

```tsx
  it('does not show a reminder for a deleted vaccination event', async () => {
    await db.animals.put({
      id: 'a1', type: 'pig', tag: 'P-01', birth_date: null, status: 'active', notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });
    await db.events.put({
      id: 'e1', client_id: 'e1', event_type: 'vaccination', entity_type: 'animal', entity_id: 'a1',
      event_date: '2026-01-01', amount: null, category: null, notes: null,
      metadata: { next_due_date: '2020-01-01' },
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
      deleted_at: '2026-01-02T00:00:00.000Z',
    });

    renderWithRouter();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
```

(`renderWithRouter` is the helper already defined at the top of this test file.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/dashboard/ProfitabilityDashboard.test.tsx src/features/reminders/VaccinationReminders.test.tsx`
Expected: FAIL — both deleted records are currently still counted/reminded.

- [ ] **Step 3: Implement**

In `src/features/dashboard/ProfitabilityDashboard.tsx`, change the three queries:

```tsx
  const events = useLiveQuery(
    () =>
      db.events
        .where('event_date')
        .between(from, to, true, true)
        .and((e) => !e.deleted_at)
        .toArray(),
    [from, to]
  );
  const animals = useLiveQuery(() => db.animals.filter((a) => !a.deleted_at).toArray(), []);
  const batches = useLiveQuery(() => db.batches.filter((b) => !b.deleted_at).toArray(), []);
```

In `src/features/reminders/VaccinationReminders.tsx`, change the two queries:

```tsx
  const events = useLiveQuery(() =>
    db.events.where('event_type').equals('vaccination').and((e) => !e.deleted_at).toArray()
  );
  const animals = useLiveQuery(() => db.animals.filter((a) => !a.deleted_at).toArray());
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/dashboard/ProfitabilityDashboard.test.tsx src/features/reminders/VaccinationReminders.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/dashboard/ProfitabilityDashboard.tsx src/features/dashboard/ProfitabilityDashboard.test.tsx src/features/reminders/VaccinationReminders.tsx src/features/reminders/VaccinationReminders.test.tsx
git commit -m "feat: exclude soft-deleted records from dashboard and reminders"
```

---

### Task 8: `AnimalForm` edit mode

**Files:**
- Modify: `src/features/animals/AnimalForm.tsx`
- Test: `src/features/animals/AnimalForm.test.tsx` (new)

- [ ] **Step 1: Write the failing tests**

Create `src/features/animals/AnimalForm.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '../../lib/db';
import { AnimalForm } from './AnimalForm';

describe('AnimalForm', () => {
  beforeEach(async () => {
    await db.animals.clear();
  });

  it('in edit mode, pre-fills from the given animal and saves changes via update, not create', async () => {
    await db.animals.put({
      id: 'a1', type: 'pig', tag: 'P-01', birth_date: null, status: 'active', notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });
    const animal = (await db.animals.get('a1'))!;
    const user = userEvent.setup();
    let saved = false;
    render(<AnimalForm editing={animal} onSaved={() => { saved = true; }} />);

    expect(screen.getByLabelText(/tag/i)).toHaveValue('P-01');
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/tag/i));
    await user.type(screen.getByLabelText(/tag/i), 'P-01-renamed');
    await user.selectOptions(screen.getByLabelText(/type/i), 'goat');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(saved).toBe(true);
    const all = await db.animals.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: 'a1', tag: 'P-01-renamed', type: 'goat' });
  });

  it('Cancel calls onSaved without changing the record', async () => {
    await db.animals.put({
      id: 'a2', type: 'pig', tag: 'P-02', birth_date: null, status: 'active', notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });
    const animal = (await db.animals.get('a2'))!;
    const user = userEvent.setup();
    let saved = false;
    render(<AnimalForm editing={animal} onSaved={() => { saved = true; }} />);

    await user.clear(screen.getByLabelText(/tag/i));
    await user.type(screen.getByLabelText(/tag/i), 'should not save');
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(saved).toBe(true);
    const stored = await db.animals.get('a2');
    expect(stored!.tag).toBe('P-02');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/animals/AnimalForm.test.tsx`
Expected: FAIL — `AnimalForm` doesn't accept `editing`/`onSaved` yet, no "Save changes"
button exists.

- [ ] **Step 3: Implement**

Replace the full contents of `src/features/animals/AnimalForm.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import type { Animal, AnimalType } from '../../lib/types';
import { createAnimal, updateAnimal } from './api';

export function AnimalForm({
  editing,
  onCreated,
  onSaved,
}: {
  editing?: Animal;
  onCreated?: (id: string) => void;
  onSaved?: () => void;
}) {
  const [type, setType] = useState<AnimalType>(editing?.type ?? 'pig');
  const [tag, setTag] = useState(editing?.tag ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    if (!tag.trim()) return;
    setIsSubmitting(true);
    try {
      if (editing) {
        await updateAnimal(editing.id, { type, tag: tag.trim() });
        onSaved?.();
      } else {
        const id = await createAnimal({ type, tag: tag.trim(), birth_date: null, notes: null });
        setTag('');
        onCreated?.(id);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="animal-type">Type</label>
      <select id="animal-type" value={type} onChange={(e) => setType(e.target.value as AnimalType)}>
        <option value="pig">Pig</option>
        <option value="goat">Goat</option>
      </select>

      <label htmlFor="animal-tag">Tag</label>
      <input id="animal-tag" value={tag} onChange={(e) => setTag(e.target.value)} />

      <button type="submit" disabled={isSubmitting}>{editing ? 'Save changes' : 'Add animal'}</button>
      {editing && (
        <button type="button" onClick={() => onSaved?.()}>
          Cancel
        </button>
      )}
    </form>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/animals/AnimalForm.test.tsx`
Expected: PASS (both tests)

Also run the full animals test suite to confirm the create path (used by `AnimalsList`)
still works:

Run: `npx vitest run src/features/animals`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/animals/AnimalForm.tsx src/features/animals/AnimalForm.test.tsx
git commit -m "feat: add edit mode to AnimalForm"
```

---

### Task 9: `AnimalDetail` — Edit/Delete + deleted-state UI

**Files:**
- Modify: `src/features/animals/AnimalDetail.tsx`
- Test: `src/features/animals/AnimalDetail.test.tsx`

- [ ] **Step 1: Write the failing tests**

Update the import lines at the top of `src/features/animals/AnimalDetail.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { db } from '../../lib/db';
import { AnimalDetail } from './AnimalDetail';
```

Add inside the existing `describe('AnimalDetail', ...)` block:

```tsx
  it('shows Edit animal / Delete animal buttons, and Edit swaps in the edit form', async () => {
    await db.animals.put({
      id: 'a7', type: 'pig', tag: 'P-07', birth_date: null, status: 'active', notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });

    const user = userEvent.setup();
    renderAt('a7');
    await screen.findByText(/P-07/);

    await user.click(screen.getByRole('button', { name: /edit animal/i }));

    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('Delete animal asks for confirmation, and does nothing if declined', async () => {
    await db.animals.put({
      id: 'a8', type: 'pig', tag: 'P-08', birth_date: null, status: 'active', notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    const user = userEvent.setup();
    renderAt('a8');
    await screen.findByText(/P-08/);

    await user.click(screen.getByRole('button', { name: /delete animal/i }));

    const stored = await db.animals.get('a8');
    expect(stored!.deleted_at).toBeFalsy();
  });

  it('Delete animal, once confirmed, marks the animal deleted and navigates to the list', async () => {
    await db.animals.put({
      id: 'a9', type: 'pig', tag: 'P-09', birth_date: null, status: 'active', notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/animals/a9']}>
        <Routes>
          <Route path="/animals/:id" element={<AnimalDetail />} />
          <Route path="/animals" element={<p>Animals list</p>} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText(/P-09/);

    await user.click(screen.getByRole('button', { name: /delete animal/i }));

    expect(await screen.findByText(/Animals list/)).toBeInTheDocument();
    const stored = await db.animals.get('a9');
    expect(stored!.deleted_at).toBeTruthy();
  });

  it('shows a Deleted notice and no Edit/Delete/log-event controls for a deleted animal', async () => {
    await db.animals.put({
      id: 'a10', type: 'pig', tag: 'P-10', birth_date: null, status: 'active', notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
      deleted_at: '2026-02-01T00:00:00.000Z',
    });

    renderAt('a10');

    expect(await screen.findByText(/deleted/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit animal/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete animal/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /log event/i })).not.toBeInTheDocument();
  });
```

This test file doesn't currently import `userEvent`; add it alongside the other
imports:

```tsx
import userEvent from '@testing-library/user-event';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/animals/AnimalDetail.test.tsx`
Expected: FAIL — no Edit/Delete buttons exist yet.

- [ ] **Step 3: Implement**

Replace the full contents of `src/features/animals/AnimalDetail.tsx`:

```tsx
import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LocalEvent } from '../../lib/db';
import type { PigStage } from '../../lib/types';
import { updateAnimalStage, deleteAnimal } from './api';
import { AnimalForm } from './AnimalForm';
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

function formatVaccinationDetail(event: LocalEvent): string {
  if (event.event_type !== 'vaccination') return '';
  const dueDate = typeof event.metadata.next_due_date === 'string' ? event.metadata.next_due_date : null;
  return dueDate ? `next due ${dueDate}` : '';
}

export function AnimalDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);

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

  async function handleDelete() {
    if (!window.confirm(`Delete ${animal!.tag}? This cannot be undone from the app.`)) return;
    await deleteAnimal(animal!.id);
    navigate('/animals');
  }

  return (
    <div>
      <h1>{animal.tag} ({animal.type})</h1>

      {animal.deleted_at ? (
        <p role="status">Deleted</p>
      ) : isEditing ? (
        <AnimalForm editing={animal} onSaved={() => setIsEditing(false)} />
      ) : (
        <>
          <p>Status: {animal.status}</p>
          <button type="button" onClick={() => setIsEditing(true)}>Edit animal</button>{' '}
          <button type="button" onClick={handleDelete}>Delete animal</button>

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
        </>
      )}

      <h2>History</h2>
      <ul>
        {(events ?? []).map((event) => {
          const feedDetail = formatFeedDetail(event);
          const vaccinationDetail = formatVaccinationDetail(event);
          return (
            <li key={event.id}>
              {event.event_date} — {event.event_type}
              {feedDetail ? ` — ${feedDetail}` : ''}
              {vaccinationDetail ? ` — ${vaccinationDetail}` : ''}
              {event.notes ? ` — ${event.notes}` : ''}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/animals/AnimalDetail.test.tsx`
Expected: PASS (all tests in the file, including the 4 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/features/animals/AnimalDetail.tsx src/features/animals/AnimalDetail.test.tsx
git commit -m "feat: add edit/delete to AnimalDetail"
```

---

### Task 10: `PlotForm` edit mode

**Files:**
- Modify: `src/features/plots/PlotForm.tsx`
- Test: `src/features/plots/PlotForm.test.tsx` (new)

- [ ] **Step 1: Write the failing tests**

Create `src/features/plots/PlotForm.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '../../lib/db';
import { PlotForm } from './PlotForm';

describe('PlotForm', () => {
  beforeEach(async () => {
    await db.plots.clear();
  });

  it('in edit mode, pre-fills from the given plot and saves changes via update, not create', async () => {
    await db.plots.put({
      id: 'p1', name: 'North Field', crop_type: 'Maize', planted_date: '2026-04-01', area: 2.5, notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });
    const plot = (await db.plots.get('p1'))!;
    const user = userEvent.setup();
    let saved = false;
    render(<PlotForm editing={plot} onSaved={() => { saved = true; }} />);

    expect(screen.getByLabelText(/name/i)).toHaveValue('North Field');
    expect(screen.getByLabelText(/crop type/i)).toHaveValue('Maize');
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/name/i));
    await user.type(screen.getByLabelText(/name/i), 'North Field renamed');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(saved).toBe(true);
    const all = await db.plots.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: 'p1', name: 'North Field renamed' });
  });

  it('Cancel calls onSaved without changing the record', async () => {
    await db.plots.put({
      id: 'p2', name: 'South Field', crop_type: null, planted_date: null, area: null, notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });
    const plot = (await db.plots.get('p2'))!;
    const user = userEvent.setup();
    let saved = false;
    render(<PlotForm editing={plot} onSaved={() => { saved = true; }} />);

    await user.clear(screen.getByLabelText(/name/i));
    await user.type(screen.getByLabelText(/name/i), 'should not save');
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(saved).toBe(true);
    const stored = await db.plots.get('p2');
    expect(stored!.name).toBe('South Field');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/plots/PlotForm.test.tsx`
Expected: FAIL — `PlotForm` doesn't accept `editing`/`onSaved` yet.

- [ ] **Step 3: Implement**

Replace the full contents of `src/features/plots/PlotForm.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import type { Plot } from '../../lib/types';
import { createPlot, updatePlot } from './api';

export function PlotForm({
  editing,
  onCreated,
  onSaved,
}: {
  editing?: Plot;
  onCreated?: (id: string) => void;
  onSaved?: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [cropType, setCropType] = useState(editing?.crop_type ?? '');
  const [plantedDate, setPlantedDate] = useState(editing?.planted_date ?? '');
  const [area, setArea] = useState(editing?.area != null ? String(editing.area) : '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      const parsedArea = area.trim() ? Number(area) : null;
      const validArea = parsedArea != null && Number.isFinite(parsedArea) && parsedArea >= 0 ? parsedArea : null;
      if (editing) {
        await updatePlot(editing.id, {
          name: name.trim(),
          crop_type: cropType.trim() || null,
          planted_date: plantedDate || null,
          area: validArea,
        });
        onSaved?.();
      } else {
        const id = await createPlot({
          name: name.trim(),
          crop_type: cropType.trim() || null,
          planted_date: plantedDate || null,
          area: validArea,
          notes: null,
        });
        setName('');
        setCropType('');
        setPlantedDate('');
        setArea('');
        onCreated?.(id);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="plot-name">Name</label>
      <input id="plot-name" value={name} onChange={(e) => setName(e.target.value)} />

      <label htmlFor="plot-crop-type">Crop type</label>
      <input id="plot-crop-type" value={cropType} onChange={(e) => setCropType(e.target.value)} />

      <label htmlFor="plot-planted-date">Planted date</label>
      <input
        id="plot-planted-date"
        type="date"
        value={plantedDate}
        onChange={(e) => setPlantedDate(e.target.value)}
      />

      <label htmlFor="plot-area">Area</label>
      <input id="plot-area" type="number" min="0" step="0.01" value={area} onChange={(e) => setArea(e.target.value)} />

      <button type="submit" disabled={isSubmitting}>{editing ? 'Save changes' : 'Add plot'}</button>
      {editing && (
        <button type="button" onClick={() => onSaved?.()}>
          Cancel
        </button>
      )}
    </form>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/plots/PlotForm.test.tsx`
Expected: PASS (both tests)

Also run the full plots suite to confirm the create path still works:

Run: `npx vitest run src/features/plots`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/plots/PlotForm.tsx src/features/plots/PlotForm.test.tsx
git commit -m "feat: add edit mode to PlotForm"
```

---

### Task 11: `PlotDetail` — Edit/Delete + deleted-state UI

**Files:**
- Modify: `src/features/plots/PlotDetail.tsx`
- Test: `src/features/plots/PlotDetail.test.tsx`

- [ ] **Step 1: Write the failing tests**

Update the import lines at the top of `src/features/plots/PlotDetail.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { db } from '../../lib/db';
import { PlotDetail } from './PlotDetail';
```

Add inside the existing `describe('PlotDetail', ...)` block:

```tsx
  it('shows Edit plot / Delete plot buttons, and Edit swaps in the edit form', async () => {
    await db.plots.put({
      id: 'p7', name: 'Edit Field', crop_type: null, planted_date: null, area: null, notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });

    const user = userEvent.setup();
    renderAt('p7');
    await screen.findByText(/Edit Field/);

    await user.click(screen.getByRole('button', { name: /edit plot/i }));

    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('Delete plot, once confirmed, marks the plot deleted and navigates to the list', async () => {
    await db.plots.put({
      id: 'p8', name: 'Delete Field', crop_type: null, planted_date: null, area: null, notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/plots/p8']}>
        <Routes>
          <Route path="/plots/:id" element={<PlotDetail />} />
          <Route path="/plots" element={<p>Plots list</p>} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText(/Delete Field/);

    await user.click(screen.getByRole('button', { name: /delete plot/i }));

    expect(await screen.findByText(/Plots list/)).toBeInTheDocument();
    const stored = await db.plots.get('p8');
    expect(stored!.deleted_at).toBeTruthy();
  });

  it('shows a Deleted notice and no Edit/Delete/log-event controls for a deleted plot', async () => {
    await db.plots.put({
      id: 'p9', name: 'Gone Field', crop_type: null, planted_date: null, area: null, notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
      deleted_at: '2026-02-01T00:00:00.000Z',
    });

    renderAt('p9');

    expect(await screen.findByText(/deleted/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit plot/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete plot/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /log event/i })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/plots/PlotDetail.test.tsx`
Expected: FAIL — no Edit/Delete buttons exist yet.

- [ ] **Step 3: Implement**

Replace the full contents of `src/features/plots/PlotDetail.tsx`:

```tsx
import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LocalEvent } from '../../lib/db';
import { deletePlot } from './api';
import { PlotForm } from './PlotForm';
import { EventForm } from '../events/EventForm';

// See AnimalDetail.tsx for why this sentinel is needed: `useLiveQuery` returns
// `undefined` both while pending and once genuinely resolved to "no such row."
const PENDING = Symbol('pending');

function formatInputDetail(event: LocalEvent): string {
  if (event.event_type !== 'input_application') return '';
  const inputType = typeof event.metadata.input_type === 'string' ? event.metadata.input_type : null;
  const productName = typeof event.metadata.product_name === 'string' ? event.metadata.product_name : null;
  const quantity = typeof event.metadata.input_quantity === 'number' ? event.metadata.input_quantity : null;
  const unit = typeof event.metadata.unit === 'string' ? event.metadata.unit : null;
  const quantityPart = quantity != null ? `${quantity}${unit ? ` ${unit}` : ''}` : null;
  return [inputType, productName, quantityPart].filter(Boolean).join(', ');
}

export function PlotDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);

  const result = useLiveQuery(() => (id ? db.plots.get(id) : undefined), [id], PENDING);
  const loading = result === PENDING;
  const plot = loading ? undefined : result;

  const events = useLiveQuery(
    () =>
      id
        ? db.events
            .where('entity_id')
            .equals(id)
            .and((e) => e.entity_type === 'plot')
            .reverse()
            .sortBy('event_date')
        : [],
    [id]
  );

  if (loading) return <p>Loading…</p>;
  if (!plot) return <p>Plot not found.</p>;

  async function handleDelete() {
    if (!window.confirm(`Delete ${plot!.name}? This cannot be undone from the app.`)) return;
    await deletePlot(plot!.id);
    navigate('/plots');
  }

  return (
    <div>
      <h1>{plot.name}</h1>

      {plot.deleted_at ? (
        <p role="status">Deleted</p>
      ) : isEditing ? (
        <PlotForm editing={plot} onSaved={() => setIsEditing(false)} />
      ) : (
        <>
          <p>
            {[
              plot.crop_type,
              plot.planted_date ? `planted ${plot.planted_date}` : 'not yet planted',
              plot.area != null ? `${plot.area} area` : null,
            ]
              .filter(Boolean)
              .join(' — ')}
          </p>
          <button type="button" onClick={() => setIsEditing(true)}>Edit plot</button>{' '}
          <button type="button" onClick={handleDelete}>Delete plot</button>

          <h2>Log an event</h2>
          <EventForm entityType="plot" entityId={plot.id} />
        </>
      )}

      <h2>History</h2>
      <ul>
        {(events ?? []).map((event) => {
          const detail = formatInputDetail(event);
          return (
            <li key={event.id}>
              {event.event_date} — {event.event_type}
              {detail ? ` — ${detail}` : ''}
              {event.amount != null ? ` — ${event.amount.toFixed(2)}` : ''}
              {event.notes ? ` — ${event.notes}` : ''}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/plots/PlotDetail.test.tsx`
Expected: PASS (all tests, including the 3 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/features/plots/PlotDetail.tsx src/features/plots/PlotDetail.test.tsx
git commit -m "feat: add edit/delete to PlotDetail"
```

---

### Task 12: `BatchForm` edit mode

**Files:**
- Modify: `src/features/batches/BatchForm.tsx`
- Test: `src/features/batches/BatchForm.test.tsx` (new)

- [ ] **Step 1: Write the failing tests**

Create `src/features/batches/BatchForm.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '../../lib/db';
import { BatchForm } from './BatchForm';

describe('BatchForm', () => {
  beforeEach(async () => {
    await db.batches.clear();
  });

  it('in edit mode, pre-fills from the given batch and saves changes via update, not create', async () => {
    await db.batches.put({
      id: 'b1', name: 'Batch A', purchase_date: '2026-01-01', initial_count: 10, purchase_cost: 500, notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });
    const batch = (await db.batches.get('b1'))!;
    const user = userEvent.setup();
    let saved = false;
    render(<BatchForm editing={batch} onSaved={() => { saved = true; }} />);

    expect(screen.getByLabelText(/name/i)).toHaveValue('Batch A');
    expect(screen.getByLabelText(/initial headcount/i)).toHaveValue(10);
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/name/i));
    await user.type(screen.getByLabelText(/name/i), 'Batch A renamed');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(saved).toBe(true);
    const all = await db.batches.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: 'b1', name: 'Batch A renamed' });
  });

  it('Cancel calls onSaved without changing the record', async () => {
    await db.batches.put({
      id: 'b2', name: 'Batch B', purchase_date: '2026-01-01', initial_count: 5, purchase_cost: null, notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });
    const batch = (await db.batches.get('b2'))!;
    const user = userEvent.setup();
    let saved = false;
    render(<BatchForm editing={batch} onSaved={() => { saved = true; }} />);

    await user.clear(screen.getByLabelText(/name/i));
    await user.type(screen.getByLabelText(/name/i), 'should not save');
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(saved).toBe(true);
    const stored = await db.batches.get('b2');
    expect(stored!.name).toBe('Batch B');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/batches/BatchForm.test.tsx`
Expected: FAIL — `BatchForm` doesn't accept `editing`/`onSaved` yet.

- [ ] **Step 3: Implement**

Replace the full contents of `src/features/batches/BatchForm.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import type { Batch } from '../../lib/types';
import { createBatch, updateBatch } from './api';

export function BatchForm({
  editing,
  onCreated,
  onSaved,
}: {
  editing?: Batch;
  onCreated?: (id: string) => void;
  onSaved?: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [purchaseDate, setPurchaseDate] = useState(
    () => editing?.purchase_date ?? new Date().toISOString().slice(0, 10)
  );
  const [initialCount, setInitialCount] = useState(editing ? String(editing.initial_count) : '');
  const [purchaseCost, setPurchaseCost] = useState(
    editing?.purchase_cost != null ? String(editing.purchase_cost) : ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    const count = Number(initialCount);
    if (!name.trim() || !Number.isFinite(count) || count <= 0) return;
    setIsSubmitting(true);
    try {
      const parsedCost = purchaseCost.trim() ? Number(purchaseCost) : null;
      const cost = parsedCost != null && Number.isFinite(parsedCost) && parsedCost >= 0 ? parsedCost : null;
      if (editing) {
        await updateBatch(editing.id, {
          name: name.trim(),
          purchase_date: purchaseDate,
          initial_count: count,
          purchase_cost: cost,
        });
        onSaved?.();
      } else {
        const id = await createBatch({
          name: name.trim(),
          purchase_date: purchaseDate,
          initial_count: count,
          purchase_cost: cost,
          notes: null,
        });
        setName('');
        setInitialCount('');
        setPurchaseCost('');
        onCreated?.(id);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="batch-name">Name</label>
      <input id="batch-name" value={name} onChange={(e) => setName(e.target.value)} />

      <label htmlFor="batch-purchase-date">Purchase date</label>
      <input
        id="batch-purchase-date"
        type="date"
        value={purchaseDate}
        onChange={(e) => setPurchaseDate(e.target.value)}
      />

      <label htmlFor="batch-initial-count">Initial headcount</label>
      <input
        id="batch-initial-count"
        type="number"
        min="1"
        step="1"
        value={initialCount}
        onChange={(e) => setInitialCount(e.target.value)}
      />

      <label htmlFor="batch-purchase-cost">Purchase cost</label>
      <input
        id="batch-purchase-cost"
        type="number"
        min="0"
        step="0.01"
        value={purchaseCost}
        onChange={(e) => setPurchaseCost(e.target.value)}
      />

      <button type="submit" disabled={isSubmitting}>{editing ? 'Save changes' : 'Add batch'}</button>
      {editing && (
        <button type="button" onClick={() => onSaved?.()}>
          Cancel
        </button>
      )}
    </form>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/batches/BatchForm.test.tsx`
Expected: PASS (both tests)

Also run the full batches suite to confirm the create path still works:

Run: `npx vitest run src/features/batches`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/batches/BatchForm.tsx src/features/batches/BatchForm.test.tsx
git commit -m "feat: add edit mode to BatchForm"
```

---

### Task 13: `BatchDetail` — Edit/Delete + deleted-state UI

**Files:**
- Modify: `src/features/batches/BatchDetail.tsx`
- Test: `src/features/batches/BatchDetail.test.tsx`

- [ ] **Step 1: Write the failing tests**

Update the import lines at the top of `src/features/batches/BatchDetail.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { db } from '../../lib/db';
import { BatchDetail } from './BatchDetail';
```

Add inside the existing `describe('BatchDetail', ...)` block:

```tsx
  it('shows Edit batch / Delete batch buttons, and Edit swaps in the edit form', async () => {
    await db.batches.put({
      id: 'b7', name: 'Edit Batch', purchase_date: '2026-01-01', initial_count: 10, purchase_cost: 500, notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });

    const user = userEvent.setup();
    renderAt('b7');
    await screen.findByText(/Edit Batch/);

    await user.click(screen.getByRole('button', { name: /edit batch/i }));

    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('Delete batch, once confirmed, marks the batch deleted and navigates to the list', async () => {
    await db.batches.put({
      id: 'b8', name: 'Delete Batch', purchase_date: '2026-01-01', initial_count: 10, purchase_cost: 500, notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/batches/b8']}>
        <Routes>
          <Route path="/batches/:id" element={<BatchDetail />} />
          <Route path="/batches" element={<p>Batches list</p>} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText(/Delete Batch/);

    await user.click(screen.getByRole('button', { name: /delete batch/i }));

    expect(await screen.findByText(/Batches list/)).toBeInTheDocument();
    const stored = await db.batches.get('b8');
    expect(stored!.deleted_at).toBeTruthy();
  });

  it('shows a Deleted notice and no Edit/Delete/log-event controls for a deleted batch', async () => {
    await db.batches.put({
      id: 'b9', name: 'Gone Batch', purchase_date: '2026-01-01', initial_count: 10, purchase_cost: 500, notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
      deleted_at: '2026-02-01T00:00:00.000Z',
    });

    renderAt('b9');

    expect(await screen.findByText(/deleted/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit batch/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete batch/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /log event/i })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/batches/BatchDetail.test.tsx`
Expected: FAIL — no Edit/Delete buttons exist yet.

- [ ] **Step 3: Implement**

Replace the full contents of `src/features/batches/BatchDetail.tsx`:

```tsx
import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LocalEvent } from '../../lib/db';
import { deleteBatch } from './api';
import { BatchForm } from './BatchForm';
import { EventForm } from '../events/EventForm';

// See AnimalDetail.tsx for why this sentinel is needed: `useLiveQuery` returns
// `undefined` both while pending and once genuinely resolved to "no such row."
const PENDING = Symbol('pending');

function eventQuantity(event: LocalEvent): number {
  const q = event.metadata.quantity;
  return typeof q === 'number' && Number.isFinite(q) ? q : 0;
}

function eventAmount(event: LocalEvent): number {
  return typeof event.amount === 'number' ? event.amount : 0;
}

function formatBatchDetail(event: LocalEvent): string {
  if (event.event_type !== 'sale' && event.event_type !== 'death') return '';
  const q = eventQuantity(event);
  return q > 0 ? `${q} pig${q === 1 ? '' : 's'}` : '';
}

export function BatchDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);

  const result = useLiveQuery(() => (id ? db.batches.get(id) : undefined), [id], PENDING);
  const loading = result === PENDING;
  const batch = loading ? undefined : result;

  const events = useLiveQuery(
    () =>
      id
        ? db.events
            .where('entity_id')
            .equals(id)
            .and((e) => e.entity_type === 'batch')
            .reverse()
            .sortBy('event_date')
        : [],
    [id]
  );

  if (loading) return <p>Loading…</p>;
  if (!batch) return <p>Batch not found.</p>;

  const soldCount = (events ?? [])
    .filter((e) => e.event_type === 'sale')
    .reduce((sum, e) => sum + eventQuantity(e), 0);
  const deadCount = (events ?? [])
    .filter((e) => e.event_type === 'death')
    .reduce((sum, e) => sum + eventQuantity(e), 0);
  const currentCount = batch.initial_count - soldCount - deadCount;

  const totalExpense = (events ?? [])
    .filter((e) => e.event_type === 'expense')
    .reduce((sum, e) => sum + eventAmount(e), 0);
  const totalRevenue = (events ?? [])
    .filter((e) => e.event_type === 'sale')
    .reduce((sum, e) => sum + eventAmount(e), 0);
  const totalCost = (batch.purchase_cost ?? 0) + totalExpense;
  const profit = totalRevenue - totalCost;

  async function handleDelete() {
    if (!window.confirm(`Delete ${batch!.name}? This cannot be undone from the app.`)) return;
    await deleteBatch(batch!.id);
    navigate('/batches');
  }

  return (
    <div>
      <h1>{batch.name}</h1>

      {batch.deleted_at ? (
        <p role="status">Deleted</p>
      ) : isEditing ? (
        <BatchForm editing={batch} onSaved={() => setIsEditing(false)} />
      ) : (
        <>
          <p>Purchased: {batch.purchase_date} — {batch.initial_count} pigs</p>
          <p>Current headcount: {currentCount}</p>
          <p>Total cost: {totalCost.toFixed(2)}</p>
          <p>Total revenue: {totalRevenue.toFixed(2)}</p>
          <p>Profit: {profit.toFixed(2)}</p>
          <button type="button" onClick={() => setIsEditing(true)}>Edit batch</button>{' '}
          <button type="button" onClick={handleDelete}>Delete batch</button>

          <h2>Log an event</h2>
          <EventForm entityType="batch" entityId={batch.id} />
        </>
      )}

      <h2>History</h2>
      <ul>
        {(events ?? []).map((event) => {
          const detail = formatBatchDetail(event);
          return (
            <li key={event.id}>
              {event.event_date} — {event.event_type}
              {detail ? ` — ${detail}` : ''}
              {event.amount != null ? ` — ${event.amount.toFixed(2)}` : ''}
              {event.notes ? ` — ${event.notes}` : ''}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/batches/BatchDetail.test.tsx`
Expected: PASS (all tests, including the 3 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/features/batches/BatchDetail.tsx src/features/batches/BatchDetail.test.tsx
git commit -m "feat: add edit/delete to BatchDetail"
```

---

### Task 14: `EventForm` edit mode

**Files:**
- Modify: `src/features/events/EventForm.tsx`
- Test: `src/features/events/EventForm.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `src/features/events/EventForm.test.tsx`, inside the existing `describe('EventForm', ...)`
block:

```tsx
  it('in edit mode, pre-fills all fields from the given event and saves via update, not create', async () => {
    const id = await createEvent({
      event_type: 'feeding', entity_type: 'animal', entity_id: 'a20',
      event_date: '2026-01-10', amount: null, category: null, notes: 'first note',
      metadata: { feed_type: 'starter', quantity_kg: 2 },
    });
    const stored = (await db.events.get(id))!;
    const user = userEvent.setup();
    let saved = false;
    render(
      <EventForm
        entityType="animal"
        entityId="a20"
        animalType="pig"
        editingEvent={stored}
        onSaved={() => { saved = true; }}
      />
    );

    expect(screen.getByLabelText(/event/i)).toHaveValue('feeding');
    expect(screen.getByLabelText('Date')).toHaveValue('2026-01-10');
    expect(screen.getByLabelText(/feed type/i)).toHaveValue('starter');
    expect(screen.getByLabelText(/quantity/i)).toHaveValue(2);
    expect(screen.getByLabelText(/notes/i)).toHaveValue('first note');
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/notes/i));
    await user.type(screen.getByLabelText(/notes/i), 'updated note');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(saved).toBe(true);
    const all = await db.events.where('entity_id').equals('a20').toArray();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id, notes: 'updated note' });
  });

  it('Cancel in edit mode calls onCancel without saving', async () => {
    const id = await createEvent({
      event_type: 'expense', entity_type: 'farm', entity_id: null,
      event_date: '2026-01-10', amount: 20, category: null, notes: null, metadata: {},
    });
    const stored = (await db.events.get(id))!;
    const user = userEvent.setup();
    let cancelled = false;
    render(
      <EventForm
        entityType="farm"
        entityId={null}
        editingEvent={stored}
        onCancel={() => { cancelled = true; }}
      />
    );

    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), '999');
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(cancelled).toBe(true);
    const after = (await db.events.get(id))!;
    expect(after.amount).toBe(20);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/events/EventForm.test.tsx`
Expected: FAIL — `EventForm` doesn't accept `editingEvent`/`onSaved`/`onCancel` yet.

- [ ] **Step 3: Implement**

In `src/features/events/EventForm.tsx`, add an import at the top:

```ts
import type { LocalEvent } from '../../lib/db';
import { createEvent, updateEvent } from './api';
```

(`updateEvent` is added to the existing `import { createEvent } from './api';` line.)

Change the component signature and every state initializer to read from `editingEvent`
when present:

```tsx
export function EventForm({
  entityType,
  entityId,
  animalType,
  pigStage,
  editingEvent,
  onCreated,
  onSaved,
  onCancel,
}: {
  entityType: EntityType;
  entityId: string | null;
  animalType?: AnimalType;
  pigStage?: PigStage | null;
  editingEvent?: LocalEvent | null;
  onCreated?: () => void;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const eventTypeOptions = EVENT_TYPES_BY_ENTITY[entityType];
  const [eventType, setEventType] = useState<EventType>(
    () => editingEvent?.event_type ?? DEFAULT_EVENT_TYPE_BY_ENTITY[entityType]
  );
  const [eventDate, setEventDate] = useState(
    () => editingEvent?.event_date ?? new Date().toISOString().slice(0, 10)
  );
  const [notes, setNotes] = useState(() => editingEvent?.notes ?? '');
  const [feedType, setFeedType] = useState(() => {
    if (typeof editingEvent?.metadata.feed_type === 'string') return editingEvent.metadata.feed_type;
    return animalType === 'pig' ? pigStage ?? 'starter' : '';
  });
  const [quantityKg, setQuantityKg] = useState(() =>
    typeof editingEvent?.metadata.quantity_kg === 'number' ? String(editingEvent.metadata.quantity_kg) : ''
  );
  const [batchQuantity, setBatchQuantity] = useState(() =>
    typeof editingEvent?.metadata.quantity === 'number' ? String(editingEvent.metadata.quantity) : '1'
  );
  const [amount, setAmount] = useState(() =>
    typeof editingEvent?.amount === 'number' ? String(editingEvent.amount) : ''
  );
  const [inputType, setInputType] = useState<(typeof INPUT_TYPES)[number]>(() => {
    const value = editingEvent?.metadata.input_type;
    return typeof value === 'string' && (INPUT_TYPES as readonly string[]).includes(value)
      ? (value as (typeof INPUT_TYPES)[number])
      : 'insecticide';
  });
  const [productName, setProductName] = useState(() =>
    typeof editingEvent?.metadata.product_name === 'string' ? editingEvent.metadata.product_name : ''
  );
  const [inputQuantity, setInputQuantity] = useState(() =>
    typeof editingEvent?.metadata.input_quantity === 'number' ? String(editingEvent.metadata.input_quantity) : ''
  );
  const [inputUnit, setInputUnit] = useState<(typeof INPUT_UNITS)[number]>(() => {
    const value = editingEvent?.metadata.unit;
    return typeof value === 'string' && (INPUT_UNITS as readonly string[]).includes(value)
      ? (value as (typeof INPUT_UNITS)[number])
      : 'liters';
  });
  const [nextDueDate, setNextDueDate] = useState(() =>
    typeof editingEvent?.metadata.next_due_date === 'string' ? editingEvent.metadata.next_due_date : ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
```

(`showFeedFields`/`showAmountField`/`showBatchQuantityField`/`showInputFields`/
`showVaccinationDueField` and `buildMetadata()`/`buildAmount()` stay exactly as they
are — they already derive purely from current field state, which is now correctly
seeded either way.)

Replace `handleSubmit`:

```tsx
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      if (editingEvent) {
        await updateEvent(editingEvent.id, {
          event_type: eventType,
          event_date: eventDate,
          amount: buildAmount(),
          category: null,
          notes: notes.trim() || null,
          metadata: buildMetadata(),
        });
        onSaved?.();
      } else {
        await createEvent({
          event_type: eventType,
          entity_type: entityType,
          entity_id: entityId,
          event_date: eventDate,
          amount: buildAmount(),
          category: null,
          notes: notes.trim() || null,
          metadata: buildMetadata(),
        });
        setNotes('');
        setQuantityKg('');
        setAmount('');
        setBatchQuantity('1');
        setProductName('');
        setInputQuantity('');
        setNextDueDate('');
        onCreated?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log event');
    } finally {
      setIsSubmitting(false);
    }
  }
```

Replace the submit button line and add a Cancel button after it:

```tsx
      <button type="submit" disabled={isSubmitting}>{editingEvent ? 'Save changes' : 'Log event'}</button>
      {editingEvent && (
        <button type="button" onClick={() => onCancel?.()}>
          Cancel
        </button>
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/events/EventForm.test.tsx`
Expected: PASS (all tests in the file, including the 2 new ones — the create-mode
tests must still pass unchanged)

- [ ] **Step 5: Commit**

```bash
git add src/features/events/EventForm.tsx src/features/events/EventForm.test.tsx
git commit -m "feat: add edit mode to EventForm"
```

---

### Task 15: `EventHistoryList` — shared component

**Files:**
- Create: `src/features/events/EventHistoryList.tsx`
- Test: `src/features/events/EventHistoryList.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/features/events/EventHistoryList.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db, type LocalEvent } from '../../lib/db';
import { EventHistoryList } from './EventHistoryList';

function makeEvent(overrides: Partial<LocalEvent>): LocalEvent {
  return {
    id: 'e1', client_id: 'e1', event_type: 'expense', entity_type: 'farm', entity_id: null,
    event_date: '2026-01-01', amount: 10, category: null, notes: null, metadata: {},
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    ...overrides,
  };
}

describe('EventHistoryList', () => {
  beforeEach(async () => {
    await db.events.clear();
  });

  it('renders each event with Edit and Delete buttons', () => {
    const events = [makeEvent({ id: 'e1' }), makeEvent({ id: 'e2', event_date: '2026-01-02' })];
    render(<EventHistoryList events={events} entityType="farm" entityId={null} />);

    expect(screen.getAllByRole('button', { name: /^edit$/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /delete/i })).toHaveLength(2);
  });

  it('Edit swaps only that row into an EventForm pre-filled from the event, leaving siblings untouched', async () => {
    await db.events.put(makeEvent({ id: 'e1', notes: 'first' }));
    await db.events.put(makeEvent({ id: 'e2', notes: 'second' }));
    const events = await db.events.toArray();
    const user = userEvent.setup();
    render(<EventHistoryList events={events} entityType="farm" entityId={null} />);

    await user.click(screen.getAllByRole('button', { name: /^edit$/i })[0]);

    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    expect(screen.getByText(/second/)).toBeInTheDocument();
  });

  it('saving an edit updates that row and collapses back to the plain line', async () => {
    await db.events.put(makeEvent({ id: 'e1', notes: 'before' }));
    const events = await db.events.toArray();
    const user = userEvent.setup();
    const { rerender } = render(<EventHistoryList events={events} entityType="farm" entityId={null} />);

    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    await user.clear(screen.getByLabelText(/notes/i));
    await user.type(screen.getByLabelText(/notes/i), 'after');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    const updated = await db.events.toArray();
    expect(updated[0].notes).toBe('after');
    rerender(<EventHistoryList events={updated} entityType="farm" entityId={null} />);
    expect(screen.getByText(/after/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
  });

  it('Delete asks for confirmation, and only deletes when confirmed', async () => {
    await db.events.put(makeEvent({ id: 'e1' }));
    const events = await db.events.toArray();
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<EventHistoryList events={events} entityType="farm" entityId={null} />);

    await user.click(screen.getByRole('button', { name: /delete/i }));
    let stored = await db.events.get('e1');
    expect(stored!.deleted_at).toBeFalsy();

    confirmSpy.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: /delete/i }));
    stored = await db.events.get('e1');
    expect(stored!.deleted_at).toBeTruthy();
  });

  it('applies a custom formatDetail function per event', () => {
    const events = [makeEvent({ id: 'e1', event_type: 'feeding', metadata: { feed_type: 'starter' } })];
    render(
      <EventHistoryList
        events={events}
        entityType="animal"
        entityId="a1"
        formatDetail={(e) => (typeof e.metadata.feed_type === 'string' ? e.metadata.feed_type : '')}
      />
    );

    expect(screen.getByText(/starter/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/events/EventHistoryList.test.tsx`
Expected: FAIL with "Cannot find module './EventHistoryList'"

- [ ] **Step 3: Implement**

Create `src/features/events/EventHistoryList.tsx`:

```tsx
import { useState } from 'react';
import type { AnimalType, EntityType, PigStage } from '../../lib/types';
import type { LocalEvent } from '../../lib/db';
import { deleteEvent } from './api';
import { EventForm } from './EventForm';

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
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  async function handleDelete(event: LocalEvent) {
    if (!window.confirm(`Delete this ${event.event_type} event? This cannot be undone from the app.`)) return;
    await deleteEvent(event.id);
  }

  return (
    <ul>
      {events.map((event) => {
        if (editingId === event.id) {
          return (
            <li key={event.id}>
              <EventForm
                entityType={entityType}
                entityId={entityId}
                animalType={animalType}
                pigStage={pigStage}
                editingEvent={event}
                onSaved={() => setEditingId(null)}
                onCancel={() => setEditingId(null)}
              />
            </li>
          );
        }

        const detail = formatDetail?.(event) ?? '';
        return (
          <li key={event.id}>
            {event.event_date} — {event.event_type}
            {detail ? ` — ${detail}` : ''}
            {event.amount != null ? ` — ${event.amount.toFixed(2)}` : ''}
            {event.notes ? ` — ${event.notes}` : ''}{' '}
            <button type="button" onClick={() => setEditingId(event.id)}>Edit</button>{' '}
            <button type="button" onClick={() => void handleDelete(event)}>Delete</button>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/events/EventHistoryList.test.tsx`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/events/EventHistoryList.tsx src/features/events/EventHistoryList.test.tsx
git commit -m "feat: add EventHistoryList shared component"
```

---

### Task 16: Wire `EventHistoryList` into `AnimalDetail`

**Files:**
- Modify: `src/features/animals/AnimalDetail.tsx`
- Test: `src/features/animals/AnimalDetail.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add inside the existing `describe('AnimalDetail', ...)` block in
`src/features/animals/AnimalDetail.test.tsx`:

```tsx
  it('a deleted event does not appear in the history list', async () => {
    await db.animals.put({
      id: 'a20', type: 'pig', tag: 'P-20', birth_date: null, status: 'active', notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });
    await db.events.put({
      id: 'e1', client_id: 'e1', event_type: 'feeding', entity_type: 'animal', entity_id: 'a20',
      event_date: '2026-01-05', amount: null, category: null, notes: 'gone', metadata: {},
      created_at: '2026-01-05T00:00:00.000Z', updated_at: '2026-01-05T00:00:00.000Z', synced: 0,
      deleted_at: '2026-01-06T00:00:00.000Z',
    });

    renderAt('a20');

    await screen.findByText(/P-20/);
    expect(screen.queryByText(/gone/)).not.toBeInTheDocument();
  });

  it('history rows offer Edit and Delete controls', async () => {
    await db.animals.put({
      id: 'a21', type: 'pig', tag: 'P-21', birth_date: null, status: 'active', notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });
    await db.events.put({
      id: 'e1', client_id: 'e1', event_type: 'feeding', entity_type: 'animal', entity_id: 'a21',
      event_date: '2026-01-05', amount: null, category: null, notes: null, metadata: {},
      created_at: '2026-01-05T00:00:00.000Z', updated_at: '2026-01-05T00:00:00.000Z', synced: 0,
    });

    renderAt('a21');

    expect(await screen.findByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/animals/AnimalDetail.test.tsx`
Expected: FAIL — the deleted event still shows, and there are no per-row Edit/Delete
buttons yet.

- [ ] **Step 3: Implement**

In `src/features/animals/AnimalDetail.tsx`, add the import:

```tsx
import { EventHistoryList } from '../events/EventHistoryList';
```

Change the `events` query to exclude soft-deleted rows:

```tsx
  const events = useLiveQuery(
    () =>
      id
        ? db.events
            .where('entity_id')
            .equals(id)
            .and((e) => e.entity_type === 'animal' && !e.deleted_at)
            .reverse()
            .sortBy('event_date')
        : [],
    [id]
  );
```

Replace the entire `<h2>History</h2><ul>...</ul>` block at the bottom with:

```tsx
      <h2>History</h2>
      <EventHistoryList
        events={events ?? []}
        entityType="animal"
        entityId={animal.id}
        animalType={animal.type}
        pigStage={animal.type === 'pig' ? animal.stage ?? null : null}
        formatDetail={(event) => formatFeedDetail(event) || formatVaccinationDetail(event)}
      />
```

(`formatFeedDetail`/`formatVaccinationDetail` stay exactly where they are, as
module-level functions — they're now passed into `EventHistoryList` instead of being
called directly in a local `.map()`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/animals/AnimalDetail.test.tsx`
Expected: PASS — all tests in the file, including the pre-existing feed/vaccination
detail tests (which still match on the same rendered text) and the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/features/animals/AnimalDetail.tsx src/features/animals/AnimalDetail.test.tsx
git commit -m "feat: wire EventHistoryList into AnimalDetail"
```

---

### Task 17: Wire `EventHistoryList` into `PlotDetail`

**Files:**
- Modify: `src/features/plots/PlotDetail.tsx`
- Test: `src/features/plots/PlotDetail.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add inside the existing `describe('PlotDetail', ...)` block in
`src/features/plots/PlotDetail.test.tsx`:

```tsx
  it('a deleted event does not appear in the history list', async () => {
    await db.plots.put({
      id: 'p20', name: 'History Field', crop_type: null, planted_date: null, area: null, notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });
    await db.events.put({
      id: 'e1', client_id: 'e1', event_type: 'planting', entity_type: 'plot', entity_id: 'p20',
      event_date: '2026-01-05', amount: null, category: null, notes: 'gone', metadata: {},
      created_at: '2026-01-05T00:00:00.000Z', updated_at: '2026-01-05T00:00:00.000Z', synced: 0,
      deleted_at: '2026-01-06T00:00:00.000Z',
    });

    renderAt('p20');

    await screen.findByText(/History Field/);
    expect(screen.queryByText(/gone/)).not.toBeInTheDocument();
  });

  it('history rows offer Edit and Delete controls', async () => {
    await db.plots.put({
      id: 'p21', name: 'Controls Field', crop_type: null, planted_date: null, area: null, notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });
    await db.events.put({
      id: 'e1', client_id: 'e1', event_type: 'planting', entity_type: 'plot', entity_id: 'p21',
      event_date: '2026-01-05', amount: null, category: null, notes: null, metadata: {},
      created_at: '2026-01-05T00:00:00.000Z', updated_at: '2026-01-05T00:00:00.000Z', synced: 0,
    });

    renderAt('p21');

    expect(await screen.findByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/plots/PlotDetail.test.tsx`
Expected: FAIL — the deleted event still shows, and there are no per-row Edit/Delete
buttons yet.

- [ ] **Step 3: Implement**

In `src/features/plots/PlotDetail.tsx`, add the import:

```tsx
import { EventHistoryList } from '../events/EventHistoryList';
```

Change the `events` query:

```tsx
  const events = useLiveQuery(
    () =>
      id
        ? db.events
            .where('entity_id')
            .equals(id)
            .and((e) => e.entity_type === 'plot' && !e.deleted_at)
            .reverse()
            .sortBy('event_date')
        : [],
    [id]
  );
```

Replace the `<h2>History</h2><ul>...</ul>` block:

```tsx
      <h2>History</h2>
      <EventHistoryList
        events={events ?? []}
        entityType="plot"
        entityId={plot.id}
        formatDetail={formatInputDetail}
      />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/plots/PlotDetail.test.tsx`
Expected: PASS — all tests, including the pre-existing input-application-detail test
and the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/features/plots/PlotDetail.tsx src/features/plots/PlotDetail.test.tsx
git commit -m "feat: wire EventHistoryList into PlotDetail"
```

---

### Task 18: Wire `EventHistoryList` into `BatchDetail`

**Files:**
- Modify: `src/features/batches/BatchDetail.tsx`
- Test: `src/features/batches/BatchDetail.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add inside the existing `describe('BatchDetail', ...)` block in
`src/features/batches/BatchDetail.test.tsx`:

```tsx
  it('a deleted event does not appear in the history list or in the headcount/profit totals', async () => {
    await db.batches.put({
      id: 'b20', name: 'History Batch', purchase_date: '2026-01-01', initial_count: 10, purchase_cost: 500, notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });
    await db.events.put({
      id: 'e1', client_id: 'e1', event_type: 'sale', entity_type: 'batch', entity_id: 'b20',
      event_date: '2026-01-05', amount: 600, category: null, notes: null, metadata: { quantity: 3 },
      created_at: '2026-01-05T00:00:00.000Z', updated_at: '2026-01-05T00:00:00.000Z', synced: 0,
      deleted_at: '2026-01-06T00:00:00.000Z',
    });

    renderAt('b20');

    expect(await screen.findByText(/Current headcount: 10/)).toBeInTheDocument();
    expect(screen.queryByText(/3 pigs/)).not.toBeInTheDocument();
  });

  it('history rows offer Edit and Delete controls', async () => {
    await db.batches.put({
      id: 'b21', name: 'Controls Batch', purchase_date: '2026-01-01', initial_count: 10, purchase_cost: 500, notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });
    await db.events.put({
      id: 'e1', client_id: 'e1', event_type: 'expense', entity_type: 'batch', entity_id: 'b21',
      event_date: '2026-01-05', amount: 20, category: null, notes: null, metadata: {},
      created_at: '2026-01-05T00:00:00.000Z', updated_at: '2026-01-05T00:00:00.000Z', synced: 0,
    });

    renderAt('b21');

    expect(await screen.findByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/batches/BatchDetail.test.tsx`
Expected: FAIL — the deleted sale still counts toward headcount, and there are no
per-row Edit/Delete buttons yet.

- [ ] **Step 3: Implement**

In `src/features/batches/BatchDetail.tsx`, add the import:

```tsx
import { EventHistoryList } from '../events/EventHistoryList';
```

Change the `events` query:

```tsx
  const events = useLiveQuery(
    () =>
      id
        ? db.events
            .where('entity_id')
            .equals(id)
            .and((e) => e.entity_type === 'batch' && !e.deleted_at)
            .reverse()
            .sortBy('event_date')
        : [],
    [id]
  );
```

(The `soldCount`/`deadCount`/`totalExpense`/`totalRevenue` computations below already
derive from this same `events` array, so filtering it here automatically fixes the
totals too — no other line in this file needs to change for that.)

Replace the `<h2>History</h2><ul>...</ul>` block:

```tsx
      <h2>History</h2>
      <EventHistoryList
        events={events ?? []}
        entityType="batch"
        entityId={batch.id}
        formatDetail={formatBatchDetail}
      />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/batches/BatchDetail.test.tsx`
Expected: PASS — all tests, including the pre-existing headcount/profit tests and the
2 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/features/batches/BatchDetail.tsx src/features/batches/BatchDetail.test.tsx
git commit -m "feat: wire EventHistoryList into BatchDetail"
```

---

### Task 19: Wire `EventHistoryList` into `FarmEvents`

**Files:**
- Modify: `src/features/farm/FarmEvents.tsx`
- Test: `src/features/farm/FarmEvents.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add inside the existing `describe('FarmEvents', ...)` block in
`src/features/farm/FarmEvents.test.tsx`:

```tsx
  it('a deleted event does not appear in the history list', async () => {
    await db.events.put({
      id: 'e1', client_id: 'e1', event_type: 'expense', entity_type: 'farm', entity_id: null,
      event_date: '2026-01-05', amount: 40, category: null, notes: 'gone', metadata: {},
      created_at: '2026-01-05T00:00:00.000Z', updated_at: '2026-01-05T00:00:00.000Z', synced: 0,
      deleted_at: '2026-01-06T00:00:00.000Z',
    });

    render(<FarmEvents />);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(/gone/)).not.toBeInTheDocument();
  });

  it('history rows offer Edit and Delete controls', async () => {
    await db.events.put({
      id: 'e1', client_id: 'e1', event_type: 'expense', entity_type: 'farm', entity_id: null,
      event_date: '2026-01-05', amount: 40, category: null, notes: null, metadata: {},
      created_at: '2026-01-05T00:00:00.000Z', updated_at: '2026-01-05T00:00:00.000Z', synced: 0,
    });

    render(<FarmEvents />);

    expect(await screen.findByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/farm/FarmEvents.test.tsx`
Expected: FAIL — the deleted event still shows, and there are no per-row Edit/Delete
buttons yet.

- [ ] **Step 3: Implement**

Replace the full contents of `src/features/farm/FarmEvents.tsx`:

```tsx
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { EventForm } from '../events/EventForm';
import { EventHistoryList } from '../events/EventHistoryList';

export function FarmEvents() {
  const events = useLiveQuery(
    () =>
      db.events
        .where('entity_type')
        .equals('farm')
        .and((e) => !e.deleted_at)
        .reverse()
        .sortBy('event_date'),
    []
  );

  return (
    <div>
      <h1>Farm</h1>

      <h2>Log an event</h2>
      <EventForm entityType="farm" entityId={null} />

      <h2>History</h2>
      <EventHistoryList events={events ?? []} entityType="farm" entityId={null} />
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/farm/FarmEvents.test.tsx`
Expected: PASS — all tests, including the pre-existing ones and the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/features/farm/FarmEvents.tsx src/features/farm/FarmEvents.test.tsx
git commit -m "feat: wire EventHistoryList into FarmEvents"
```

---

### Task 20: Full suite and build verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — every test file, including all pre-existing tests untouched by this
plan (e.g. `dueVaccinations.test.ts`, `sync.test.ts`) and every test added across
Tasks 1–19.

- [ ] **Step 2: Run the type checker**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: succeeds with no errors (warnings about chunk size, if any, are pre-existing
and unrelated to this plan).

- [ ] **Step 4: Manual smoke check (if a browser/dev server is available)**

Start the dev server and, signed in:
1. Edit an existing animal's tag, confirm it updates in the list.
2. Delete an existing plot, confirm it disappears from the plots list, and that
   navigating directly to its URL still shows it marked "Deleted" with its history
   intact.
3. Log a feeding event on an animal, edit it via the history row, confirm the change
   is reflected, then delete it and confirm it disappears from that animal's history
   and from the profitability dashboard's totals.

- [ ] **Step 5: Final commit (if any cleanup was needed)**

If Steps 1–4 required no fixes, there's nothing to commit here — this task is a
verification gate, not a code change. If a fix was needed, commit it with a message
describing what was wrong and why.
