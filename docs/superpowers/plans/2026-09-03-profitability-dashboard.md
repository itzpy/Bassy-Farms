# Profitability Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/dashboard` screen showing total cost/revenue/profit over a selectable date range, broken down by Pigs/Goats/Batches/Plots/Farm-wide — the PRD's V2 "financial visibility" milestone.

**Architecture:** A pure aggregation function (`aggregateProfitability`) that buckets already-existing `events`/`animals`/`batches` records by type and date range, called from a thin React screen that fetches data via `useLiveQuery` and renders the result as a summary line + table. No new tables, migrations, or event/entity types.

**Tech Stack:** React, TypeScript, Dexie (`dexie-react-hooks`), React Router, Vitest + Testing Library.

---

### Task 1: `aggregateProfitability` pure function

**Files:**
- Create: `src/features/dashboard/aggregate.ts`
- Test: `src/features/dashboard/aggregate.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/features/dashboard/aggregate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { aggregateProfitability } from './aggregate';
import type { LocalEvent, LocalAnimal, LocalBatch } from '../../lib/db';

function makeEvent(overrides: Partial<LocalEvent>): LocalEvent {
  return {
    id: 'e', client_id: 'e', event_type: 'expense', entity_type: 'animal', entity_id: 'a1',
    event_date: '2026-02-15', amount: 0, category: null, notes: null, metadata: {},
    created_at: '2026-02-15T00:00:00.000Z', updated_at: '2026-02-15T00:00:00.000Z', synced: 0,
    ...overrides,
  };
}

function makeAnimal(overrides: Partial<LocalAnimal>): LocalAnimal {
  return {
    id: 'a1', type: 'pig', tag: 'P-01', birth_date: null, status: 'active', notes: null,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    ...overrides,
  };
}

function makeBatch(overrides: Partial<LocalBatch>): LocalBatch {
  return {
    id: 'b1', name: 'Batch A', purchase_date: '2026-01-01', initial_count: 10,
    purchase_cost: 500, notes: null,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    ...overrides,
  };
}

const BUCKET_LABELS = ['Pigs', 'Goats', 'Batches', 'Plots', 'Farm-wide'];

describe('aggregateProfitability', () => {
  it('returns all 5 zeroed buckets and a zeroed overall for empty input', () => {
    const result = aggregateProfitability([], [], [], '2026-02-01', '2026-02-28');

    expect(result.buckets.map((b) => b.label)).toEqual(BUCKET_LABELS);
    for (const bucket of result.buckets) {
      expect(bucket).toMatchObject({ cost: 0, revenue: 0, profit: 0 });
    }
    expect(result.overall).toMatchObject({ label: 'Overall', cost: 0, revenue: 0, profit: 0 });
  });

  it('includes events exactly on the from/to boundaries, excludes events one day outside', () => {
    const events = [
      makeEvent({ id: 'on-from', event_date: '2026-02-01', amount: 10 }),
      makeEvent({ id: 'on-to', event_date: '2026-02-28', amount: 20 }),
      makeEvent({ id: 'before', event_date: '2026-01-31', amount: 999 }),
      makeEvent({ id: 'after', event_date: '2026-03-01', amount: 999 }),
    ];

    const result = aggregateProfitability(events, [makeAnimal({})], [], '2026-02-01', '2026-02-28');

    const pigs = result.buckets.find((b) => b.label === 'Pigs')!;
    expect(pigs.cost).toBe(30);
  });

  it('routes a pig expense to Pigs and a goat expense to Goats using the animals array', () => {
    const events = [
      makeEvent({ id: 'pig-e', entity_id: 'a1', amount: 15 }),
      makeEvent({ id: 'goat-e', entity_id: 'a2', amount: 25 }),
    ];
    const animals = [
      makeAnimal({ id: 'a1', type: 'pig' }),
      makeAnimal({ id: 'a2', type: 'goat', tag: 'G-01' }),
    ];

    const result = aggregateProfitability(events, animals, [], '2026-02-01', '2026-02-28');

    expect(result.buckets.find((b) => b.label === 'Pigs')!.cost).toBe(15);
    expect(result.buckets.find((b) => b.label === 'Goats')!.cost).toBe(25);
  });

  it('routes batch/plot/farm events to their respective buckets', () => {
    const events = [
      makeEvent({ id: 'batch-e', entity_type: 'batch', entity_id: 'b1', event_type: 'sale', amount: 100 }),
      makeEvent({ id: 'plot-e', entity_type: 'plot', entity_id: 'p1', event_type: 'expense', amount: 40 }),
      makeEvent({ id: 'farm-e', entity_type: 'farm', entity_id: null, event_type: 'expense', amount: 60 }),
    ];

    const result = aggregateProfitability(events, [], [], '2026-02-01', '2026-02-28');

    expect(result.buckets.find((b) => b.label === 'Batches')!.revenue).toBe(100);
    expect(result.buckets.find((b) => b.label === 'Plots')!.cost).toBe(40);
    expect(result.buckets.find((b) => b.label === 'Farm-wide')!.cost).toBe(60);
  });

  it('ignores non-expense/sale event types', () => {
    const events = [
      makeEvent({ id: 'feeding', event_type: 'feeding', amount: null }),
    ];

    const result = aggregateProfitability(events, [makeAnimal({})], [], '2026-02-01', '2026-02-28');

    const pigs = result.buckets.find((b) => b.label === 'Pigs')!;
    expect(pigs).toMatchObject({ cost: 0, revenue: 0, profit: 0 });
  });

  it('includes a batch purchase_cost in Batches when purchase_date is in range, excludes when out of range', () => {
    const inRange = aggregateProfitability(
      [], [], [makeBatch({ id: 'b1', purchase_date: '2026-02-10', purchase_cost: 500 })],
      '2026-02-01', '2026-02-28'
    );
    expect(inRange.buckets.find((b) => b.label === 'Batches')!.cost).toBe(500);

    const outOfRange = aggregateProfitability(
      [], [], [makeBatch({ id: 'b1', purchase_date: '2026-01-10', purchase_cost: 500 })],
      '2026-02-01', '2026-02-28'
    );
    expect(outOfRange.buckets.find((b) => b.label === 'Batches')!.cost).toBe(0);
  });

  it('sums all buckets into overall, and computes profit as revenue minus cost per bucket', () => {
    const events = [
      makeEvent({ id: 'pig-expense', entity_id: 'a1', event_type: 'expense', amount: 10 }),
      makeEvent({ id: 'pig-sale', entity_id: 'a1', event_type: 'sale', amount: 50 }),
      makeEvent({ id: 'plot-expense', entity_type: 'plot', entity_id: 'p1', event_type: 'expense', amount: 5 }),
    ];

    const result = aggregateProfitability(events, [makeAnimal({})], [], '2026-02-01', '2026-02-28');

    const pigs = result.buckets.find((b) => b.label === 'Pigs')!;
    expect(pigs).toMatchObject({ cost: 10, revenue: 50, profit: 40 });
    expect(result.overall).toMatchObject({ cost: 15, revenue: 50, profit: 35 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/dashboard/aggregate.test.ts`
Expected: FAIL with "Cannot find module './aggregate'"

- [ ] **Step 3: Write the implementation**

Create `src/features/dashboard/aggregate.ts`:

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

function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

function emptyBucket(label: string): Bucket {
  return { label, cost: 0, revenue: 0, profit: 0 };
}

export function aggregateProfitability(
  events: LocalEvent[],
  animals: LocalAnimal[],
  batches: LocalBatch[],
  from: string,
  to: string
): ProfitabilityResult {
  const buckets: Record<string, Bucket> = {
    Pigs: emptyBucket('Pigs'),
    Goats: emptyBucket('Goats'),
    Batches: emptyBucket('Batches'),
    Plots: emptyBucket('Plots'),
    'Farm-wide': emptyBucket('Farm-wide'),
  };

  const animalTypeById = new Map(animals.map((a) => [a.id, a.type]));

  function bucketFor(event: LocalEvent): Bucket | null {
    switch (event.entity_type) {
      case 'farm':
        return buckets['Farm-wide'];
      case 'plot':
        return buckets.Plots;
      case 'batch':
        return buckets.Batches;
      case 'animal': {
        const type = event.entity_id ? animalTypeById.get(event.entity_id) : undefined;
        if (type === 'pig') return buckets.Pigs;
        if (type === 'goat') return buckets.Goats;
        return null;
      }
      default:
        return null;
    }
  }

  for (const event of events) {
    if (!inRange(event.event_date, from, to)) continue;
    if (event.event_type !== 'expense' && event.event_type !== 'sale') continue;
    const bucket = bucketFor(event);
    if (!bucket) continue;
    const amount = event.amount ?? 0;
    if (event.event_type === 'expense') bucket.cost += amount;
    else bucket.revenue += amount;
  }

  for (const batch of batches) {
    if (inRange(batch.purchase_date, from, to)) {
      buckets.Batches.cost += batch.purchase_cost ?? 0;
    }
  }

  const orderedBuckets = [buckets.Pigs, buckets.Goats, buckets.Batches, buckets.Plots, buckets['Farm-wide']];
  for (const bucket of orderedBuckets) {
    bucket.profit = bucket.revenue - bucket.cost;
  }

  const overall: Bucket = {
    label: 'Overall',
    cost: orderedBuckets.reduce((sum, b) => sum + b.cost, 0),
    revenue: orderedBuckets.reduce((sum, b) => sum + b.revenue, 0),
    profit: 0,
  };
  overall.profit = overall.revenue - overall.cost;

  return { buckets: orderedBuckets, overall };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/dashboard/aggregate.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/dashboard/aggregate.ts src/features/dashboard/aggregate.test.ts
git commit -m "feat: add profitability aggregation function"
```

---

### Task 2: `ProfitabilityDashboard` screen

**Files:**
- Create: `src/features/dashboard/ProfitabilityDashboard.tsx`
- Test: `src/features/dashboard/ProfitabilityDashboard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/dashboard/ProfitabilityDashboard.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { db } from '../../lib/db';
import { ProfitabilityDashboard } from './ProfitabilityDashboard';

describe('ProfitabilityDashboard', () => {
  beforeEach(async () => {
    await db.animals.clear();
    await db.batches.clear();
    await db.events.clear();
  });

  it('shows totals for a mixed fixture within the default (this-month) range', async () => {
    const today = new Date().toISOString().slice(0, 10);

    await db.animals.put({
      id: 'a1', type: 'pig', tag: 'P-01', birth_date: null, status: 'active', notes: null,
      created_at: today + 'T00:00:00.000Z', updated_at: today + 'T00:00:00.000Z', synced: 0,
    });
    await db.events.put({
      id: 'e1', client_id: 'e1', event_type: 'expense', entity_type: 'animal', entity_id: 'a1',
      event_date: today, amount: 30, category: null, notes: null, metadata: {},
      created_at: today + 'T00:00:00.000Z', updated_at: today + 'T00:00:00.000Z', synced: 0,
    });

    render(<ProfitabilityDashboard />);

    expect(await screen.findByText(/Cost: 30\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Profit: -30\.00/)).toBeInTheDocument();
  });

  it('updates totals when the date range is changed to exclude an event', async () => {
    await db.events.put({
      id: 'e1', client_id: 'e1', event_type: 'expense', entity_type: 'farm', entity_id: null,
      event_date: '2026-02-15', amount: 50, category: null, notes: null, metadata: {},
      created_at: '2026-02-15T00:00:00.000Z', updated_at: '2026-02-15T00:00:00.000Z', synced: 0,
    });

    render(<ProfitabilityDashboard />);

    // fireEvent.change (not userEvent.type/clear) is the reliable way to drive
    // <input type="date"> in jsdom — userEvent's keystroke-by-keystroke typing
    // doesn't interact well with the native date-input editing model here.
    fireEvent.change(screen.getByLabelText(/from/i), { target: { value: '2026-02-01' } });
    fireEvent.change(screen.getByLabelText(/to/i), { target: { value: '2026-02-28' } });

    expect(await screen.findByText(/Cost: 50\.00/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/to/i), { target: { value: '2026-02-14' } });

    expect(await screen.findByText(/Cost: 0\.00/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/dashboard/ProfitabilityDashboard.test.tsx`
Expected: FAIL with "Cannot find module './ProfitabilityDashboard'"

- [ ] **Step 3: Write the implementation**

Create `src/features/dashboard/ProfitabilityDashboard.tsx`:

```tsx
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { aggregateProfitability } from './aggregate';

function startOfMonth(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ProfitabilityDashboard() {
  const [from, setFrom] = useState(startOfMonth);
  const [to, setTo] = useState(today);

  const events = useLiveQuery(
    () => db.events.where('event_date').between(from, to, true, true).toArray(),
    [from, to]
  );
  const animals = useLiveQuery(() => db.animals.toArray(), []);
  const batches = useLiveQuery(() => db.batches.toArray(), []);

  const { buckets, overall } = aggregateProfitability(events ?? [], animals ?? [], batches ?? [], from, to);

  return (
    <div>
      <h1>Dashboard</h1>

      <label htmlFor="dashboard-from">From</label>
      <input id="dashboard-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />

      <label htmlFor="dashboard-to">To</label>
      <input id="dashboard-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />

      <p>
        Cost: {overall.cost.toFixed(2)} — Revenue: {overall.revenue.toFixed(2)} — Profit: {overall.profit.toFixed(2)}
      </p>

      <table>
        <thead>
          <tr>
            <th>Group</th>
            <th>Cost</th>
            <th>Revenue</th>
            <th>Profit</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.label}>
              <td>{bucket.label}</td>
              <td>{bucket.cost.toFixed(2)}</td>
              <td>{bucket.revenue.toFixed(2)}</td>
              <td>{bucket.profit.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/dashboard/ProfitabilityDashboard.test.tsx`
Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/dashboard/ProfitabilityDashboard.tsx src/features/dashboard/ProfitabilityDashboard.test.tsx
git commit -m "feat: add profitability dashboard screen"
```

---

### Task 3: Wire up routing and navigation

**Files:**
- Modify: `src/routes.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the route**

In `src/routes.tsx`, add the import:

```tsx
import { ProfitabilityDashboard } from './features/dashboard/ProfitabilityDashboard';
```

and add the route inside `<Routes>`, after the `/farm` route:

```tsx
      <Route path="/dashboard" element={<ProfitabilityDashboard />} />
```

The full file should read:

```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { AnimalsList } from './features/animals/AnimalsList';
import { AnimalDetail } from './features/animals/AnimalDetail';
import { BatchesList } from './features/batches/BatchesList';
import { BatchDetail } from './features/batches/BatchDetail';
import { PlotsList } from './features/plots/PlotsList';
import { PlotDetail } from './features/plots/PlotDetail';
import { FarmEvents } from './features/farm/FarmEvents';
import { ProfitabilityDashboard } from './features/dashboard/ProfitabilityDashboard';

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
      <Route path="/farm" element={<FarmEvents />} />
      <Route path="/dashboard" element={<ProfitabilityDashboard />} />
    </Routes>
  );
}
```

- [ ] **Step 2: Add the nav link**

In `src/App.tsx`, change:

```tsx
            <nav>
              <Link to="/animals">Animals</Link> <Link to="/batches">Batches</Link>{' '}
              <Link to="/plots">Plots</Link> <Link to="/farm">Farm</Link>
            </nav>
```

to:

```tsx
            <nav>
              <Link to="/animals">Animals</Link> <Link to="/batches">Batches</Link>{' '}
              <Link to="/plots">Plots</Link> <Link to="/farm">Farm</Link>{' '}
              <Link to="/dashboard">Dashboard</Link>
            </nav>
```

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — all existing tests plus the new `aggregate`/`ProfitabilityDashboard` tests (46 pre-existing + 7 aggregate + 2 dashboard = 55 total).

- [ ] **Step 4: Run the build**

Run: `npm run build`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes.tsx src/App.tsx
git commit -m "feat: wire up profitability dashboard routing and navigation"
```

---

## Self-Review Notes

- **Spec coverage:** `aggregateProfitability` (spec §2) → Task 1, including the batch-purchase-cost-in-range rule and animal-type routing. `ProfitabilityDashboard` screen with date inputs defaulting to this-month, summary line, and always-5-rows table (spec §3) → Task 2. Routing/nav (spec §4) → Task 3. Testing (spec §5) → Tasks 1–2. Error handling (spec §6, "total function, no throws") → Task 1's implementation has no throwing paths; defensive animal-lookup-miss returns `null` and is skipped.
- **Out-of-scope items confirmed absent:** no `category` field, no per-individual-entity rows, no charts, no editing.
- **Type consistency:** `Bucket`/`ProfitabilityResult` types in Task 1 are imported unchanged by Task 2's component (`aggregateProfitability(events ?? [], animals ?? [], batches ?? [], from, to)` matches the exact signature `(events, animals, batches, from, to)` defined in Task 1). Bucket labels (`'Pigs' | 'Goats' | 'Batches' | 'Plots' | 'Farm-wide'`) are used identically in Task 1's implementation, Task 1's tests, and are rendered as-is (no relabeling) in Task 2's table.
