# Plots and Crop Input Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the missing Plots UI (list, detail, create form — the `plots` table/type/sync already existed from V1 but no screens were ever built) and add crop input application tracking (insecticide/fungicide/herbicide/fertilizer/other) per `docs/superpowers/specs/2026-09-02-plots-and-crop-inputs-design.md`.

**Architecture:** No new tables. A new `EventType` value (`input_application`) logged against a plot via the existing generic `events` table, following the exact pattern established for feed tracking and batch cost/sale tracking. `EventForm`'s event-type-list selection is refactored from a two-way ternary to a lookup table to cleanly support a third entity type.

**Tech Stack:** Same as the rest of the app — React, TypeScript, Dexie, Supabase, Vitest, React Testing Library.

---

## IMPORTANT process notes

- **Always verify TypeScript with `npx tsc -b --noEmit`**, never bare `npx tsc --noEmit`.
- **A real, unrelated bug was found and already fixed before this plan was written:** the `events` table's `entity_type` check constraint on Supabase was never updated when the batches feature added `entity_type: 'batch'` — every batch event has been silently failing to sync. This was fixed directly (migration `0004_fix_events_entity_type_check.sql`, already applied to the live project and committed on `main`) — no task in this plan needs to touch it, just be aware it's already handled.
- **`plots` DOES need a Dexie version bump** for this plan — not because it's a new store (it already exists), but because `PlotsList` needs to `.orderBy('name')` and the current index string (`'id, synced, updated_at'`) doesn't include `name`. Changing an *existing* store's index string also requires a new Dexie version, same as adding a new store does.
- **The Supabase `events_event_type_check` constraint** also needs widening (a real migration, not optional) — Postgres check constraints reject any value outside the declared set, so inserting an `input_application` event without this migration would fail exactly like the `entity_type` bug above. Task 1 handles this.

---

## File structure this plan touches

```
supabase/migrations/0005_add_input_application_event_type.sql   (new)
src/lib/types.ts                                                 (modify)
src/lib/db.ts                                                    (modify)
src/features/plots/api.ts                                        (new)
src/features/plots/api.test.ts                                   (new)
src/features/events/EventForm.tsx                                 (modify)
src/features/events/EventForm.test.tsx                            (modify)
src/features/plots/PlotForm.tsx                                   (new)
src/features/plots/PlotsList.tsx                                  (new)
src/features/plots/PlotsList.test.tsx                             (new)
src/features/plots/PlotDetail.tsx                                 (new)
src/features/plots/PlotDetail.test.tsx                            (new)
src/routes.tsx                                                    (modify)
src/App.tsx                                                       (modify)
```

---

### Task 1: Data model — event type, Supabase migration, Dexie index

**Files:**
- Create: `supabase/migrations/0005_add_input_application_event_type.sql`
- Modify: `src/lib/types.ts`, `src/lib/db.ts`

- [ ] **Step 1: Write the migration**

`supabase/migrations/0005_add_input_application_event_type.sql`:
```sql
alter table events drop constraint events_event_type_check;
alter table events add constraint events_event_type_check
  check (event_type in (
    'feeding','vaccination','weight','health_check','breeding','death',
    'planting','harvest','expense','sale','input_application'
  ));
```

- [ ] **Step 2: Add `input_application` to `EventType`**

In `src/lib/types.ts`, change the `EventType` union (currently lines 39-49) from:
```ts
export type EventType =
  | 'feeding'
  | 'vaccination'
  | 'weight'
  | 'health_check'
  | 'breeding'
  | 'death'
  | 'planting'
  | 'harvest'
  | 'expense'
  | 'sale';
```
to:
```ts
export type EventType =
  | 'feeding'
  | 'vaccination'
  | 'weight'
  | 'health_check'
  | 'breeding'
  | 'death'
  | 'planting'
  | 'harvest'
  | 'expense'
  | 'sale'
  | 'input_application';
```

- [ ] **Step 3: Add `name` to the `plots` Dexie index**

In `src/lib/db.ts`, add a new `version(4)` block right after the existing `version(3)` block, inside the `FarmDB` constructor:
```ts
    this.version(4).stores({
      animals: 'id, tag, type, status, synced, updated_at',
      plots: 'id, name, synced, updated_at',
      events: 'id, client_id, entity_type, entity_id, event_type, event_date, synced, updated_at',
      batches: 'id, purchase_date, synced, updated_at',
    });
```
(`animals`, `events`, `batches` are restated unchanged from `version(3)`; only `plots` gains `name`.)

- [ ] **Step 4: Verify it compiles and existing tests still pass**

Run: `npx tsc -b --noEmit`
Expected: exits 0.

Run: `npm run test`
Expected: PASS, all existing tests still pass (adding an `EventType` union member and a Dexie index doesn't change any existing behavior).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0005_add_input_application_event_type.sql src/lib/types.ts src/lib/db.ts
git commit -m "feat: add input_application event type and plots name index"
```

**Note for the human running this plan:** apply `0005_add_input_application_event_type.sql` to your Supabase project.

---

### Task 2: Plots data layer

**Files:**
- Create: `src/features/plots/api.ts`, `src/features/plots/api.test.ts`

- [ ] **Step 1: Write the failing test**

`src/features/plots/api.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../lib/db';
import { createPlot } from './api';

describe('plots api', () => {
  beforeEach(async () => {
    await db.plots.clear();
  });

  it('createPlot stores a new unsynced plot', async () => {
    const id = await createPlot({
      name: 'North Field',
      crop_type: 'Maize',
      planted_date: '2026-04-01',
      area: 2.5,
      notes: null,
    });
    const stored = await db.plots.get(id);
    expect(stored).toMatchObject({
      name: 'North Field',
      crop_type: 'Maize',
      planted_date: '2026-04-01',
      area: 2.5,
      synced: 0,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- features/plots/api.test.ts`
Expected: FAIL — `./api` module doesn't exist.

- [ ] **Step 3: Implement the API**

`src/features/plots/api.ts`:
```ts
import { db } from '../../lib/db';

export interface NewPlotInput {
  name: string;
  crop_type: string | null;
  planted_date: string | null;
  area: number | null;
  notes: string | null;
}

export async function createPlot(input: NewPlotInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.plots.put({
    id,
    name: input.name,
    crop_type: input.crop_type,
    planted_date: input.planted_date,
    area: input.area,
    notes: input.notes,
    created_at: now,
    updated_at: now,
    synced: 0,
  });
  return id;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- features/plots/api.test.ts`
Expected: PASS, 1 test passed.

- [ ] **Step 5: Verify no new type errors**

Run: `npx tsc -b --noEmit`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/features/plots/api.ts src/features/plots/api.test.ts
git commit -m "feat: add plots data layer"
```

---

### Task 3: EventForm — entity-aware event types via lookup table, crop input fields

**Files:**
- Modify: `src/features/events/EventForm.tsx`, `src/features/events/EventForm.test.tsx`

This task does two things at once: refactors the event-type-list selection
from a ternary to a lookup table (a structural cleanup with NO behavior
change for animals/batches — the existing 11 tests must keep passing
unmodified, proving this), and adds the new crop-input fields for plots.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/events/EventForm.test.tsx` (inside the existing `describe('EventForm', ...)` block, after the last existing test):
```tsx
  it('offers planting/harvest/input_application/expense/sale for a plot, defaulting to input_application', async () => {
    render(<EventForm entityType="plot" entityId="p1" />);

    const select = screen.getByLabelText(/event/i) as HTMLSelectElement;
    expect(select).toHaveValue('input_application');
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual(['planting', 'harvest', 'input_application', 'expense', 'sale']);
  });

  it('shows input-application fields for a plot, and stores them as metadata', async () => {
    const user = userEvent.setup();
    render(<EventForm entityType="plot" entityId="p2" />);

    await user.selectOptions(screen.getByLabelText(/input type/i), 'insecticide');
    await user.type(screen.getByLabelText(/product name/i), 'Roundup');
    await user.type(screen.getByLabelText(/quantity/i), '2');
    await user.selectOptions(screen.getByLabelText(/unit/i), 'liters');
    await user.click(screen.getByRole('button', { name: /log event/i }));

    const events = await db.events.where('entity_id').equals('p2').toArray();
    expect(events).toHaveLength(1);
    expect(events[0].metadata).toMatchObject({
      input_type: 'insecticide',
      product_name: 'Roundup',
      quantity: 2,
      unit: 'liters',
    });
  });

  it('does not show input-application fields for a plot planting event', async () => {
    const user = userEvent.setup();
    render(<EventForm entityType="plot" entityId="p3" />);

    await user.selectOptions(screen.getByLabelText(/event/i), 'planting');

    expect(screen.queryByLabelText(/input type/i)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- features/events/EventForm.test.tsx`
Expected: all 3 new tests FAIL — `entityType="plot"` isn't handled specially yet (falls through to the animal list currently, since the ternary only checks for `'batch'`), and no input-application fields exist yet. The 11 existing tests must still PASS (nothing here should touch them yet).

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

const PLOT_EVENT_TYPES: EventType[] = ['planting', 'harvest', 'input_application', 'expense', 'sale'];

const FARM_EVENT_TYPES: EventType[] = ['expense', 'sale'];

const EVENT_TYPES_BY_ENTITY: Record<EntityType, EventType[]> = {
  animal: ANIMAL_EVENT_TYPES,
  batch: BATCH_EVENT_TYPES,
  plot: PLOT_EVENT_TYPES,
  farm: FARM_EVENT_TYPES,
};

const DEFAULT_EVENT_TYPE_BY_ENTITY: Record<EntityType, EventType> = {
  animal: 'feeding',
  batch: 'expense',
  plot: 'input_application',
  farm: 'expense',
};

const PIG_STAGES: PigStage[] = ['starter', 'grower', 'finisher'];
const INPUT_TYPES = ['insecticide', 'fungicide', 'herbicide', 'fertilizer', 'other'] as const;
const INPUT_UNITS = ['liters', 'kg'] as const;

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
  const eventTypeOptions = EVENT_TYPES_BY_ENTITY[entityType];
  const [eventType, setEventType] = useState<EventType>(DEFAULT_EVENT_TYPE_BY_ENTITY[entityType]);
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [feedType, setFeedType] = useState(() => (animalType === 'pig' ? pigStage ?? 'starter' : ''));
  const [quantityKg, setQuantityKg] = useState('');
  const [batchQuantity, setBatchQuantity] = useState('1');
  const [amount, setAmount] = useState('');
  const [inputType, setInputType] = useState<(typeof INPUT_TYPES)[number]>('insecticide');
  const [productName, setProductName] = useState('');
  const [inputQuantity, setInputQuantity] = useState('');
  const [inputUnit, setInputUnit] = useState<(typeof INPUT_UNITS)[number]>('liters');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showFeedFields = eventType === 'feeding' && (animalType === 'pig' || animalType === 'goat');
  const showAmountField = eventType === 'expense' || eventType === 'sale';
  const showBatchQuantityField = entityType === 'batch' && (eventType === 'sale' || eventType === 'death');
  const showInputFields = entityType === 'plot' && eventType === 'input_application';

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
    if (showInputFields) {
      metadata.input_type = inputType;
      if (productName.trim()) metadata.product_name = productName.trim();
      const parsedInputQuantity = Number(inputQuantity);
      if (inputQuantity.trim() && Number.isFinite(parsedInputQuantity) && parsedInputQuantity >= 0) {
        metadata.quantity = parsedInputQuantity;
        metadata.unit = inputUnit;
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
      setBatchQuantity('1');
      setProductName('');
      setInputQuantity('');
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

      {showInputFields && (
        <>
          <label htmlFor="input-type">Input type</label>
          <select
            id="input-type"
            value={inputType}
            onChange={(e) => setInputType(e.target.value as (typeof INPUT_TYPES)[number])}
          >
            {INPUT_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>

          <label htmlFor="product-name">Product name</label>
          <input id="product-name" value={productName} onChange={(e) => setProductName(e.target.value)} />

          <label htmlFor="input-quantity">Quantity</label>
          <input
            id="input-quantity"
            type="number"
            min="0"
            step="0.1"
            value={inputQuantity}
            onChange={(e) => setInputQuantity(e.target.value)}
          />

          <label htmlFor="input-unit">Unit</label>
          <select
            id="input-unit"
            value={inputUnit}
            onChange={(e) => setInputUnit(e.target.value as (typeof INPUT_UNITS)[number])}
          >
            {INPUT_UNITS.map((unit) => (
              <option key={unit} value={unit}>{unit}</option>
            ))}
          </select>
        </>
      )}

      {showAmountField && (
        <>
          <label htmlFor="event-amount">{showBatchQuantityField ? 'Total amount' : 'Amount'}</label>
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

**Note on the refactor's correctness:** `EVENT_TYPES_BY_ENTITY.animal`/`.batch` and `DEFAULT_EVENT_TYPE_BY_ENTITY.animal`/`.batch` reference the exact same constants/values the old ternary produced (`ANIMAL_EVENT_TYPES`/`'feeding'` and `BATCH_EVENT_TYPES`/`'expense'`), so the 11 existing tests (which cover animal and batch behavior) must pass completely unmodified — that's the proof this refactor is behavior-preserving for the two entity types it isn't adding new behavior for.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- features/events/EventForm.test.tsx`
Expected: PASS, 14 tests passed (11 existing + 3 new).

- [ ] **Step 5: Run the full suite and verify no new type errors**

Run: `npm run test`
Expected: PASS, all tests passed.

Run: `npx tsc -b --noEmit`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/features/events/EventForm.tsx src/features/events/EventForm.test.tsx
git commit -m "refactor: entity-aware event types via lookup table, add crop input fields"
```

---

### Task 4: PlotsList and PlotForm

**Files:**
- Create: `src/features/plots/PlotForm.tsx`, `src/features/plots/PlotsList.tsx`, `src/features/plots/PlotsList.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/features/plots/PlotsList.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../../lib/db';
import { PlotsList } from './PlotsList';

describe('PlotsList', () => {
  beforeEach(async () => {
    await db.plots.clear();
  });

  it('adds a new plot and shows it in the list', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PlotsList />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/name/i), 'North Field');
    await user.click(screen.getByRole('button', { name: /add plot/i }));

    expect(await screen.findByText('North Field')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- features/plots/PlotsList.test.tsx`
Expected: FAIL — `./PlotsList` doesn't exist.

- [ ] **Step 3: Write `PlotForm.tsx`**

`src/features/plots/PlotForm.tsx`:
```tsx
import { useState, type FormEvent } from 'react';
import { createPlot } from './api';

export function PlotForm({ onCreated }: { onCreated?: (id: string) => void }) {
  const [name, setName] = useState('');
  const [cropType, setCropType] = useState('');
  const [plantedDate, setPlantedDate] = useState('');
  const [area, setArea] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      const parsedArea = area.trim() ? Number(area) : null;
      const id = await createPlot({
        name: name.trim(),
        crop_type: cropType.trim() || null,
        planted_date: plantedDate || null,
        area: parsedArea != null && Number.isFinite(parsedArea) && parsedArea >= 0 ? parsedArea : null,
        notes: null,
      });
      setName('');
      setCropType('');
      setPlantedDate('');
      setArea('');
      onCreated?.(id);
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

      <button type="submit" disabled={isSubmitting}>Add plot</button>
    </form>
  );
}
```

- [ ] **Step 4: Write `PlotsList.tsx`**

`src/features/plots/PlotsList.tsx`:
```tsx
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { PlotForm } from './PlotForm';

export function PlotsList() {
  const plots = useLiveQuery(() => db.plots.orderBy('name').toArray(), []);

  return (
    <div>
      <h1>Plots</h1>
      <PlotForm />
      <ul>
        {(plots ?? []).map((plot) => (
          <li key={plot.id}>
            <Link to={`/plots/${plot.id}`}>{plot.name}</Link>
            {plot.crop_type ? ` — ${plot.crop_type}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -- features/plots/PlotsList.test.tsx`
Expected: PASS, 1 test passed.

- [ ] **Step 6: Run the full suite and verify no new type errors**

Run: `npm run test`
Expected: PASS, all tests passed.

Run: `npx tsc -b --noEmit`
Expected: exits 0 (`PlotDetail` doesn't exist yet, nothing references it yet either).

- [ ] **Step 7: Commit**

```bash
git add src/features/plots/PlotForm.tsx src/features/plots/PlotsList.tsx src/features/plots/PlotsList.test.tsx
git commit -m "feat: add plots list screen with add-plot form"
```

---

### Task 5: PlotDetail

**Files:**
- Create: `src/features/plots/PlotDetail.tsx`, `src/features/plots/PlotDetail.test.tsx`

- [ ] **Step 1: Write the failing tests**

`src/features/plots/PlotDetail.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { db } from '../../lib/db';
import { PlotDetail } from './PlotDetail';

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/plots/${id}`]}>
      <Routes>
        <Route path="/plots/:id" element={<PlotDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PlotDetail', () => {
  beforeEach(async () => {
    await db.plots.clear();
    await db.events.clear();
  });

  it('shows the plot once loaded, for a valid id', async () => {
    await db.plots.put({
      id: 'p1',
      name: 'North Field',
      crop_type: 'Maize',
      planted_date: '2026-04-01',
      area: 2.5,
      notes: null,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
      synced: 0,
    });

    renderAt('p1');

    expect(await screen.findByText(/North Field/)).toBeInTheDocument();
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it('shows a not-found message for a nonexistent id', async () => {
    renderAt('does-not-exist');

    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
  });

  it('shows input-application detail in the history', async () => {
    await db.plots.put({
      id: 'p2',
      name: 'South Field',
      crop_type: 'Beans',
      planted_date: '2026-04-01',
      area: 1,
      notes: null,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
      synced: 0,
    });
    await db.events.put({
      id: 'e1', client_id: 'e1', event_type: 'input_application', entity_type: 'plot', entity_id: 'p2',
      event_date: '2026-05-01', amount: null, category: null, notes: null,
      metadata: { input_type: 'insecticide', product_name: 'Roundup', input_quantity: 2, unit: 'liters' },
      created_at: '2026-05-01T00:00:00.000Z', updated_at: '2026-05-01T00:00:00.000Z', synced: 0,
    });

    renderAt('p2');

    await screen.findByText(/South Field/);
    expect(await screen.findByText(/insecticide, Roundup, 2 liters/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- features/plots/PlotDetail.test.tsx`
Expected: FAIL — `./PlotDetail` doesn't exist.

- [ ] **Step 3: Implement `PlotDetail.tsx`**

`src/features/plots/PlotDetail.tsx`:
```tsx
import { useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LocalEvent } from '../../lib/db';
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

  return (
    <div>
      <h1>{plot.name}</h1>
      <p>
        {plot.crop_type ? `${plot.crop_type} — ` : ''}
        {plot.planted_date ? `planted ${plot.planted_date}` : 'not yet planted'}
        {plot.area != null ? ` — ${plot.area} area` : ''}
      </p>

      <h2>Log an event</h2>
      <EventForm entityType="plot" entityId={plot.id} />

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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- features/plots/PlotDetail.test.tsx`
Expected: PASS, 3 tests passed.

- [ ] **Step 5: Run the full suite and verify zero type errors**

Run: `npm run test`
Expected: PASS, all tests passed.

Run: `npx tsc -b --noEmit`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/features/plots/PlotDetail.tsx src/features/plots/PlotDetail.test.tsx
git commit -m "feat: add plot detail screen with input-application history"
```

---

### Task 6: Routing and navigation

**Files:**
- Modify: `src/routes.tsx`, `src/App.tsx`

- [ ] **Step 1: Add plot routes**

Replace the full contents of `src/routes.tsx` with:
```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { AnimalsList } from './features/animals/AnimalsList';
import { AnimalDetail } from './features/animals/AnimalDetail';
import { BatchesList } from './features/batches/BatchesList';
import { BatchDetail } from './features/batches/BatchDetail';
import { PlotsList } from './features/plots/PlotsList';
import { PlotDetail } from './features/plots/PlotDetail';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/animals" replace />} />
      <Route path="/animals" element={<AnimalsList />} />
      <Route path="/animals/:id" element={<AnimalDetail />} />
      <Route path="/batches" element={<BatchesList />} />
      <Route path="/batches/:id" element={<BatchDetail />} />
      <Route path="/plots" element={<PlotsList />} />
      <Route path="/plots/:id" element={<PlotDetail />} />
    </Routes>
  );
}
```

- [ ] **Step 2: Add the Plots nav link**

In `src/App.tsx`, change:
```tsx
            <nav>
              <Link to="/animals">Animals</Link> <Link to="/batches">Batches</Link>
            </nav>
```
to:
```tsx
            <nav>
              <Link to="/animals">Animals</Link> <Link to="/batches">Batches</Link>{' '}
              <Link to="/plots">Plots</Link>
            </nav>
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
git commit -m "feat: wire up plots routing and navigation"
```

---

## Plan self-review notes

- **Spec coverage:** §1 (data model) → Task 1 (`input_application` event type, Supabase constraint, Dexie `name` index). §2 (EventForm changes) → Task 3 (lookup-table refactor + crop input fields). §3 (UI) → Tasks 4 (list/form), 5 (detail), 6 (routing/nav). §4 (testing) → a test is written for every new/changed behavior; the refactor's correctness is proven by the 11 pre-existing EventForm tests passing unmodified. §5 (error handling) → `createPlot` reuses the same propagate-Dexie-errors pattern as `createAnimal`/`createBatch`.
- **Type consistency:** `EVENT_TYPES_BY_ENTITY`/`DEFAULT_EVENT_TYPE_BY_ENTITY` are both `Record<EntityType, ...>`, so TypeScript enforces every `EntityType` value (including the not-yet-used `'farm'`) has an entry — no silent gaps.
- **No placeholders:** every code block is complete; the two deliberately-manual steps (Task 1's migration application) are called out explicitly.
- **Deviation from the spec's literal wording**, documented in "IMPORTANT process notes": the `plots` Dexie index gains `name` (not mentioned in the spec, which focused on the metadata/EventForm changes) — needed because `PlotsList` orders by name, matching the same proactive-indexing lesson applied in the batches plan.
