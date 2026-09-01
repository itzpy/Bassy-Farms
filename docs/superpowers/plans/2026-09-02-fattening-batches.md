# Pig Fattening Batches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pig fattening batches — a cohort of pigs bought together, tracked as a headcount rather than individual animals, with cost/sale events and a computed running profitability — per `docs/superpowers/specs/2026-09-02-fattening-batches-design.md`.

**Architecture:** A new `batches` table alongside `animals`/`plots`. Costs/sales/deaths are ordinary `events` rows (`entity_type: 'batch'`) using existing event types (`expense`, `sale`, `death`) with a new `quantity` metadata field for sale/death. Headcount and profitability are computed client-side from a batch's events, never stored.

**Tech Stack:** Same as the rest of the app — React, TypeScript, Dexie, Supabase, Vitest, React Testing Library.

---

## IMPORTANT process notes

- **Always verify TypeScript with `npx tsc -b --noEmit`**, never bare `npx tsc --noEmit` — the latter silently checks zero files in this project.
- **This DOES need a Dexie version bump** (unlike feed tracking's `stage` field) — `batches` is a brand new object store, and Dexie/IndexedDB only creates stores that are declared in `.stores()`. New `version(3)` restates `animals`/`plots`/`events` unchanged and adds `batches`.
- **Deviation from the spec's literal wording:** the design doc's Dexie index string for `batches` was `'id, synced, updated_at'` (no `purchase_date`). Task 4 (`BatchesList`) needs to order batches by `purchase_date`, and Dexie throws a `SchemaError` at runtime if you `.orderBy()` a non-indexed field — this exact class of bug was hit and fixed once already during the V1 build (a missing `tag` index on `animals`). To avoid repeating it, Task 1 indexes `purchase_date` from the start: `batches: 'id, purchase_date, synced, updated_at'`.
- **No dedicated test for the Task 6 navigation/routing change.** The app currently has no test file for `App.tsx` at all (a known, pre-existing gap — testing it would require mocking an authenticated session, infrastructure that doesn't exist yet). Task 6 is a small, low-risk wiring change; adding `App.tsx` test infrastructure is out of scope for this plan.

---

## File structure this plan touches

```
supabase/migrations/0003_add_batches.sql   (new)
src/lib/types.ts                            (modify)
src/lib/db.ts                               (modify)
src/lib/sync.ts                             (modify)
src/features/batches/api.ts                 (new)
src/features/batches/api.test.ts            (new)
src/features/events/EventForm.tsx           (modify)
src/features/events/EventForm.test.tsx      (modify)
src/features/batches/BatchForm.tsx          (new)
src/features/batches/BatchesList.tsx        (new)
src/features/batches/BatchesList.test.tsx   (new)
src/features/batches/BatchDetail.tsx        (new)
src/features/batches/BatchDetail.test.tsx   (new)
src/routes.tsx                              (modify)
src/App.tsx                                 (modify)
```

---

### Task 1: Data model — types, Supabase migration, Dexie, sync engine

**Files:**
- Create: `supabase/migrations/0003_add_batches.sql`
- Modify: `src/lib/types.ts`, `src/lib/db.ts`, `src/lib/sync.ts`

- [ ] **Step 1: Write the migration**

`supabase/migrations/0003_add_batches.sql`:
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

- [ ] **Step 2: Add the `Batch` type and extend `EntityType`**

In `src/lib/types.ts`, add this interface right after the closing `}` of `Plot` (currently line 26), before `export type EventType =`:
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

Change line 40 from:
```ts
export type EntityType = 'animal' | 'plot' | 'farm';
```
to:
```ts
export type EntityType = 'animal' | 'plot' | 'farm' | 'batch';
```

- [ ] **Step 3: Add the `batches` Dexie table**

Replace the full contents of `src/lib/db.ts` with:
```ts
import Dexie, { type Table } from 'dexie';
import type { Animal, Plot, FarmEvent, Batch } from './types';

export interface LocalAnimal extends Animal {
  synced: 0 | 1;
}
export interface LocalPlot extends Plot {
  synced: 0 | 1;
}
export interface LocalEvent extends FarmEvent {
  synced: 0 | 1;
}
export interface LocalBatch extends Batch {
  synced: 0 | 1;
}

export class FarmDB extends Dexie {
  animals!: Table<LocalAnimal, string>;
  plots!: Table<LocalPlot, string>;
  events!: Table<LocalEvent, string>;
  batches!: Table<LocalBatch, string>;

  constructor() {
    super('farm-db');
    this.version(1).stores({
      animals: 'id, type, status, synced, updated_at',
      plots: 'id, synced, updated_at',
      events: 'id, client_id, entity_type, entity_id, event_type, event_date, synced, updated_at',
    });
    this.version(2).stores({
      animals: 'id, tag, type, status, synced, updated_at',
      plots: 'id, synced, updated_at',
      events: 'id, client_id, entity_type, entity_id, event_type, event_date, synced, updated_at',
    });
    this.version(3).stores({
      animals: 'id, tag, type, status, synced, updated_at',
      plots: 'id, synced, updated_at',
      events: 'id, client_id, entity_type, entity_id, event_type, event_date, synced, updated_at',
      batches: 'id, purchase_date, synced, updated_at',
    });
  }
}

export const db = new FarmDB();
```

- [ ] **Step 4: Add `batches` to the sync engine**

In `src/lib/sync.ts`, change line 4 from:
```ts
export const SYNC_TABLES = ['animals', 'plots', 'events'] as const;
```
to:
```ts
export const SYNC_TABLES = ['animals', 'plots', 'events', 'batches'] as const;
```

Change the `lastPullAt` initializer (currently lines 46-50) from:
```ts
let lastPullAt: Record<SyncTable, string> = {
  animals: EPOCH,
  plots: EPOCH,
  events: EPOCH,
};
```
to:
```ts
let lastPullAt: Record<SyncTable, string> = {
  animals: EPOCH,
  plots: EPOCH,
  events: EPOCH,
  batches: EPOCH,
};
```

Change `resetSyncCursors` (currently line 53) from:
```ts
export function resetSyncCursors(): void {
  lastPullAt = { animals: EPOCH, plots: EPOCH, events: EPOCH };
}
```
to:
```ts
export function resetSyncCursors(): void {
  lastPullAt = { animals: EPOCH, plots: EPOCH, events: EPOCH, batches: EPOCH };
}
```

- [ ] **Step 5: Verify it compiles and existing tests still pass**

Run: `npx tsc -b --noEmit`
Expected: exits 0.

Run: `npm run test`
Expected: PASS, all existing tests still pass (adding a table/sync-table doesn't change any existing behavior — `SYNC_TABLES.map(...)` loops and `TypeScript`'s `Record<SyncTable, string>` completeness check are the only places that needed the new key added, and both were updated above).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0003_add_batches.sql src/lib/types.ts src/lib/db.ts src/lib/sync.ts
git commit -m "feat: add batches table to schema, types, and sync engine"
```

**Note for the human running this plan:** apply `0003_add_batches.sql` to your Supabase project.

---

### Task 2: Batches data layer

**Files:**
- Create: `src/features/batches/api.ts`, `src/features/batches/api.test.ts`

- [ ] **Step 1: Write the failing test**

`src/features/batches/api.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../lib/db';
import { createBatch } from './api';

describe('batches api', () => {
  beforeEach(async () => {
    await db.batches.clear();
  });

  it('createBatch stores a new unsynced batch', async () => {
    const id = await createBatch({
      name: 'Batch A',
      purchase_date: '2026-09-01',
      initial_count: 10,
      purchase_cost: 500,
      notes: null,
    });
    const stored = await db.batches.get(id);
    expect(stored).toMatchObject({
      name: 'Batch A',
      purchase_date: '2026-09-01',
      initial_count: 10,
      purchase_cost: 500,
      synced: 0,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- features/batches/api.test.ts`
Expected: FAIL — `./api` module doesn't exist.

- [ ] **Step 3: Implement the API**

`src/features/batches/api.ts`:
```ts
import { db } from '../../lib/db';

export interface NewBatchInput {
  name: string;
  purchase_date: string;
  initial_count: number;
  purchase_cost: number | null;
  notes: string | null;
}

export async function createBatch(input: NewBatchInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.batches.put({
    id,
    name: input.name,
    purchase_date: input.purchase_date,
    initial_count: input.initial_count,
    purchase_cost: input.purchase_cost,
    notes: input.notes,
    created_at: now,
    updated_at: now,
    synced: 0,
  });
  return id;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- features/batches/api.test.ts`
Expected: PASS, 1 test passed.

- [ ] **Step 5: Verify no new type errors**

Run: `npx tsc -b --noEmit`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/features/batches/api.ts src/features/batches/api.test.ts
git commit -m "feat: add batches data layer"
```

---

### Task 3: EventForm — amount field, entity-aware event types, batch headcount field

**Files:**
- Modify: `src/features/events/EventForm.tsx`, `src/features/events/EventForm.test.tsx`

This task fixes a pre-existing gap (no way to enter an `amount` from the UI at all, for any entity type) while adding batch-specific fields — write the new tests first (TDD), even though `EventForm` already exists, exactly as was done for the feed-tracking fields.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/events/EventForm.test.tsx` (inside the existing `describe('EventForm', ...)` block, after the last existing test):
```tsx
  it('shows an amount field for expense/sale events on any entity type, and stores it', async () => {
    const user = userEvent.setup();
    render(<EventForm entityType="animal" entityId="a6" />);

    await user.selectOptions(screen.getByLabelText(/event/i), 'expense');
    await user.type(screen.getByLabelText(/amount/i), '25.50');
    await user.click(screen.getByRole('button', { name: /log event/i }));

    const events = await db.events.where('entity_id').equals('a6').toArray();
    expect(events).toHaveLength(1);
    expect(events[0].amount).toBe(25.5);
  });

  it('offers only expense/sale/death for a batch, defaulting to expense', async () => {
    render(<EventForm entityType="batch" entityId="b1" />);

    const select = screen.getByLabelText(/event/i) as HTMLSelectElement;
    expect(select).toHaveValue('expense');
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual(['expense', 'sale', 'death']);
  });

  it('shows a headcount field for a batch sale, defaulted to 1, and stores it as metadata.quantity', async () => {
    const user = userEvent.setup();
    render(<EventForm entityType="batch" entityId="b2" />);

    await user.selectOptions(screen.getByLabelText(/event/i), 'sale');
    const countInput = screen.getByLabelText(/number of pigs/i);
    expect(countInput).toHaveValue(1);

    await user.clear(countInput);
    await user.type(countInput, '3');
    await user.type(screen.getByLabelText(/amount/i), '600');
    await user.click(screen.getByRole('button', { name: /log event/i }));

    const events = await db.events.where('entity_id').equals('b2').toArray();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ amount: 600 });
    expect(events[0].metadata).toMatchObject({ quantity: 3 });
  });

  it('does not show a headcount field for a batch expense', async () => {
    render(<EventForm entityType="batch" entityId="b3" />);

    expect(screen.queryByLabelText(/number of pigs/i)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- features/events/EventForm.test.tsx`
Expected: the first two new tests FAIL (no `amount` field exists yet; `entityType="batch"` isn't handled specially yet, so the full `ANIMAL_EVENT_TYPES` list shows instead of the 3-item batch list). The third and fourth FAIL (no headcount field exists yet).

- [ ] **Step 3: Implement the changes**

Replace the full contents of `src/features/events/EventForm.tsx` with:
```tsx
import { useState, type FormEvent } from 'react';
import type { AnimalType, EntityType, EventType, PigStage } from '../../lib/types';
import { createEvent } from './api';

const ANIMAL_EVENT_TYPES: EventType[] = [
  'feeding', 'vaccination', 'weight', 'health_check', 'breeding', 'death', 'expense', 'sale',
];

const BATCH_EVENT_TYPES: EventType[] = ['expense', 'sale', 'death'];

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
  const eventTypeOptions = entityType === 'batch' ? BATCH_EVENT_TYPES : ANIMAL_EVENT_TYPES;
  const [eventType, setEventType] = useState<EventType>(entityType === 'batch' ? 'expense' : 'feeding');
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [feedType, setFeedType] = useState(() => (animalType === 'pig' ? pigStage ?? 'starter' : ''));
  const [quantityKg, setQuantityKg] = useState('');
  const [batchQuantity, setBatchQuantity] = useState('1');
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showFeedFields = eventType === 'feeding' && (animalType === 'pig' || animalType === 'goat');
  const showAmountField = eventType === 'expense' || eventType === 'sale';
  const showBatchQuantityField = entityType === 'batch' && (eventType === 'sale' || eventType === 'death');

  function buildMetadata(): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};
    if (showFeedFields) {
      if (feedType.trim()) metadata.feed_type = feedType.trim();
      const parsedQuantity = Number(quantityKg);
      if (quantityKg.trim() && Number.isFinite(parsedQuantity) && parsedQuantity >= 0) {
        metadata.quantity_kg = parsedQuantity;
      }
    }
    if (showBatchQuantityField) {
      const parsedCount = Number(batchQuantity);
      if (batchQuantity.trim() && Number.isFinite(parsedCount) && parsedCount > 0) {
        metadata.quantity = parsedCount;
      }
    }
    return metadata;
  }

  function buildAmount(): number | null {
    if (!showAmountField) return null;
    const parsed = Number(amount);
    if (amount.trim() && Number.isFinite(parsed) && parsed >= 0) return parsed;
    return null;
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
        amount: buildAmount(),
        category: null,
        notes: notes.trim() || null,
        metadata: buildMetadata(),
      });
      setNotes('');
      setQuantityKg('');
      setAmount('');
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
        {eventTypeOptions.map((type) => (
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

      {showBatchQuantityField && (
        <>
          <label htmlFor="batch-quantity">Number of pigs</label>
          <input
            id="batch-quantity"
            type="number"
            min="1"
            step="1"
            value={batchQuantity}
            onChange={(e) => setBatchQuantity(e.target.value)}
          />
        </>
      )}

      {showAmountField && (
        <>
          <label htmlFor="event-amount">Amount</label>
          <input
            id="event-amount"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- features/events/EventForm.test.tsx`
Expected: PASS, 9 tests passed (5 existing + 4 new).

- [ ] **Step 5: Run the full suite and verify no new type errors**

Run: `npm run test`
Expected: PASS, all tests passed.

Run: `npx tsc -b --noEmit`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/features/events/EventForm.tsx src/features/events/EventForm.test.tsx
git commit -m "feat: add amount field and batch headcount field to EventForm"
```

---

### Task 4: BatchesList and BatchForm

**Files:**
- Create: `src/features/batches/BatchForm.tsx`, `src/features/batches/BatchesList.tsx`, `src/features/batches/BatchesList.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/features/batches/BatchesList.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../../lib/db';
import { BatchesList } from './BatchesList';

describe('BatchesList', () => {
  beforeEach(async () => {
    await db.batches.clear();
  });

  it('adds a new batch and shows it in the list', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <BatchesList />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/name/i), 'Batch A');
    await user.type(screen.getByLabelText(/initial headcount/i), '10');
    await user.click(screen.getByRole('button', { name: /add batch/i }));

    expect(await screen.findByText('Batch A')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- features/batches/BatchesList.test.tsx`
Expected: FAIL — `./BatchesList` doesn't exist.

- [ ] **Step 3: Write `BatchForm.tsx`**

`src/features/batches/BatchForm.tsx`:
```tsx
import { useState, type FormEvent } from 'react';
import { createBatch } from './api';

export function BatchForm({ onCreated }: { onCreated?: (id: string) => void }) {
  const [name, setName] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [initialCount, setInitialCount] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('');
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

      <button type="submit" disabled={isSubmitting}>Add batch</button>
    </form>
  );
}
```

- [ ] **Step 4: Write `BatchesList.tsx`**

`src/features/batches/BatchesList.tsx`:
```tsx
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { BatchForm } from './BatchForm';

export function BatchesList() {
  const batches = useLiveQuery(() => db.batches.orderBy('purchase_date').reverse().toArray(), []);

  return (
    <div>
      <h1>Batches</h1>
      <BatchForm />
      <ul>
        {(batches ?? []).map((batch) => (
          <li key={batch.id}>
            <Link to={`/batches/${batch.id}`}>{batch.name}</Link> — {batch.purchase_date} ({batch.initial_count} pigs)
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -- features/batches/BatchesList.test.tsx`
Expected: PASS, 1 test passed.

- [ ] **Step 6: Run the full suite and verify no new type errors**

Run: `npm run test`
Expected: PASS, all tests passed.

Run: `npx tsc -b --noEmit`
Expected: exits 0. `BatchDetail` doesn't exist yet (Task 5 creates it) and nothing at this point references it, so there is nothing to error about — confirm genuinely zero errors, not just "no new" ones.

- [ ] **Step 7: Commit**

```bash
git add src/features/batches/BatchForm.tsx src/features/batches/BatchesList.tsx src/features/batches/BatchesList.test.tsx
git commit -m "feat: add batches list screen with add-batch form"
```

---

### Task 5: BatchDetail — headcount, profitability, EventForm wiring, history

**Files:**
- Create: `src/features/batches/BatchDetail.tsx`, `src/features/batches/BatchDetail.test.tsx`

- [ ] **Step 1: Write the failing tests**

`src/features/batches/BatchDetail.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { db } from '../../lib/db';
import { BatchDetail } from './BatchDetail';

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/batches/${id}`]}>
      <Routes>
        <Route path="/batches/:id" element={<BatchDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('BatchDetail', () => {
  beforeEach(async () => {
    await db.batches.clear();
    await db.events.clear();
  });

  it('shows the batch once loaded, for a valid id', async () => {
    await db.batches.put({
      id: 'b1',
      name: 'Batch A',
      purchase_date: '2026-01-01',
      initial_count: 10,
      purchase_cost: 500,
      notes: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      synced: 0,
    });

    renderAt('b1');

    expect(await screen.findByText(/Batch A/)).toBeInTheDocument();
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it('shows a not-found message for a nonexistent id', async () => {
    renderAt('does-not-exist');

    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
  });

  it('computes current headcount and profit from sale/expense/death events', async () => {
    await db.batches.put({
      id: 'b2',
      name: 'Batch B',
      purchase_date: '2026-01-01',
      initial_count: 10,
      purchase_cost: 500,
      notes: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      synced: 0,
    });
    await db.events.put({
      id: 'e1', client_id: 'e1', event_type: 'expense', entity_type: 'batch', entity_id: 'b2',
      event_date: '2026-02-01', amount: 100, category: null, notes: null, metadata: {},
      created_at: '2026-02-01T00:00:00.000Z', updated_at: '2026-02-01T00:00:00.000Z', synced: 0,
    });
    await db.events.put({
      id: 'e2', client_id: 'e2', event_type: 'sale', entity_type: 'batch', entity_id: 'b2',
      event_date: '2026-03-01', amount: 300, category: null, notes: null, metadata: { quantity: 3 },
      created_at: '2026-03-01T00:00:00.000Z', updated_at: '2026-03-01T00:00:00.000Z', synced: 0,
    });
    await db.events.put({
      id: 'e3', client_id: 'e3', event_type: 'death', entity_type: 'batch', entity_id: 'b2',
      event_date: '2026-03-05', amount: null, category: null, notes: null, metadata: { quantity: 1 },
      created_at: '2026-03-05T00:00:00.000Z', updated_at: '2026-03-05T00:00:00.000Z', synced: 0,
    });

    renderAt('b2');

    await screen.findByText(/Batch B/);
    // 10 initial - 3 sold - 1 died = 6
    expect(await screen.findByText(/current headcount: 6/i)).toBeInTheDocument();
    // total cost = 500 purchase + 100 expense = 600; revenue = 300; profit = -300
    expect(screen.getByText(/total cost: 600/i)).toBeInTheDocument();
    expect(screen.getByText(/total revenue: 300/i)).toBeInTheDocument();
    expect(screen.getByText(/profit: -300/i)).toBeInTheDocument();
    expect(screen.getByText(/3 pigs/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- features/batches/BatchDetail.test.tsx`
Expected: FAIL — `./BatchDetail` doesn't exist.

- [ ] **Step 3: Implement `BatchDetail.tsx`**

`src/features/batches/BatchDetail.tsx`:
```tsx
import { useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LocalEvent } from '../../lib/db';
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

  return (
    <div>
      <h1>{batch.name}</h1>
      <p>Purchased: {batch.purchase_date} — {batch.initial_count} pigs</p>
      <p>Current headcount: {currentCount}</p>
      <p>Total cost: {totalCost.toFixed(2)}</p>
      <p>Total revenue: {totalRevenue.toFixed(2)}</p>
      <p>Profit: {profit.toFixed(2)}</p>

      <h2>Log an event</h2>
      <EventForm entityType="batch" entityId={batch.id} />

      <h2>History</h2>
      <ul>
        {(events ?? []).map((event) => {
          const detail = formatBatchDetail(event);
          return (
            <li key={event.id}>
              {event.event_date} — {event.event_type}
              {detail ? ` — ${detail}` : ''}
              {event.amount != null ? ` — ${event.amount}` : ''}
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

Run: `npm run test -- features/batches/BatchDetail.test.tsx`
Expected: PASS, 3 tests passed.

- [ ] **Step 5: Run the full suite and verify zero type errors**

Run: `npm run test`
Expected: PASS, all tests passed.

Run: `npx tsc -b --noEmit`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/features/batches/BatchDetail.tsx src/features/batches/BatchDetail.test.tsx
git commit -m "feat: add batch detail screen with computed headcount and profitability"
```

---

### Task 6: Routing and navigation

**Files:**
- Modify: `src/routes.tsx`, `src/App.tsx`

- [ ] **Step 1: Add batch routes**

Replace the full contents of `src/routes.tsx` with:
```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { AnimalsList } from './features/animals/AnimalsList';
import { AnimalDetail } from './features/animals/AnimalDetail';
import { BatchesList } from './features/batches/BatchesList';
import { BatchDetail } from './features/batches/BatchDetail';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/animals" replace />} />
      <Route path="/animals" element={<AnimalsList />} />
      <Route path="/animals/:id" element={<AnimalDetail />} />
      <Route path="/batches" element={<BatchesList />} />
      <Route path="/batches/:id" element={<BatchDetail />} />
    </Routes>
  );
}
```

- [ ] **Step 2: Add minimal navigation**

Replace the full contents of `src/App.tsx` with:
```tsx
import { useEffect } from 'react';
import { BrowserRouter, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppRoutes } from './routes';
import { startSyncLoop } from './lib/sync';
import { UnsyncedIndicator } from './components/UnsyncedIndicator';

function SyncManager() {
  const { session } = useAuth();
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    const stop = startSyncLoop();
    return stop;
    // Keyed on user id (not the session object) so a token refresh — which produces a
    // new session reference with the same user — doesn't tear down and restart the loop.
  }, [userId]);

  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <SyncManager />
        <ProtectedRoute>
          <div className="app-shell">
            <nav>
              <Link to="/animals">Animals</Link> <Link to="/batches">Batches</Link>
            </nav>
            <UnsyncedIndicator />
            <AppRoutes />
          </div>
        </ProtectedRoute>
      </BrowserRouter>
    </AuthProvider>
  );
}
```

- [ ] **Step 3: Verify it compiles and the full suite passes**

Run: `npx tsc -b --noEmit`
Expected: exits 0.

Run: `npm run test`
Expected: PASS, all tests passed.

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/routes.tsx src/App.tsx
git commit -m "feat: wire up batches routing and add minimal app navigation"
```

---

## Plan self-review notes

- **Spec coverage:** §1 (data model) → Task 1 (types, migration, Dexie, sync engine) and Task 2 (`createBatch`). §2 (EventForm changes) → Task 3. §3 (data layer) → Task 2. §4 (UI) → Tasks 4 (list/form), 5 (detail/computation), 6 (routing/nav). §5 (testing) → a test is written for every new/changed behavior in each task. §6 (error handling) → `createBatch` reuses the same propagate-Dexie-errors pattern as `createAnimal`; `EventForm`'s existing `isSubmitting`/try-catch/`role="alert"` machinery already covers the new fields.
- **Type consistency:** `Batch`/`LocalBatch` defined once (Task 1) and used consistently in `api.ts`, `BatchForm.tsx`, `BatchesList.tsx`, `BatchDetail.tsx`. `metadata.quantity` (headcount) is never confused with `metadata.quantity_kg` (feed weight) — different field names, different event types, never both present on the same event.
- **No placeholders:** every code block is complete and copy-pasteable; the one deliberately-manual step (Task 1's note to apply the migration to the live Supabase project) is called out explicitly.
- **Deviations from the spec's literal wording**, both documented in "IMPORTANT process notes": the `batches` Dexie index string includes `purchase_date` (spec said just `id, synced, updated_at`) to avoid a known bug class (missing index for an `.orderBy()` call) that was already hit once during the V1 build; no dedicated test exists for the Task 6 nav/routing change, matching the app's existing lack of `App.tsx` test coverage.
