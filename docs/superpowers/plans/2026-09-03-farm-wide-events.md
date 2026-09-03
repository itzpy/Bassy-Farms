# Farm-Wide Events Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/farm` screen for logging expense/sale events that aren't tied to a specific animal, batch, or plot, closing the last gap from the plots project.

**Architecture:** Widen `EventForm`'s `entityId` prop to accept `null` (the `NewEventInput`/`FarmEvent` types already allow it), add a new `FarmEvents` component that embeds `EventForm` with `entityType="farm"` and `entityId={null}` plus a history list queried by `entity_type === 'farm'`, and wire up routing/nav.

**Tech Stack:** React, TypeScript, React Router, Dexie (`dexie-react-hooks`), Vitest + Testing Library.

---

### Task 1: Widen `EventForm`'s `entityId` prop to `string | null`

**Files:**
- Modify: `src/features/events/EventForm.tsx:37-49` (props type), `:110-114` (the `createEvent` call already passes `entityId` straight through as `entity_id`, which is already typed `string | null` in `NewEventInput` — no change needed there)
- Test: `src/features/events/EventForm.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `src/features/events/EventForm.test.tsx`, inside the existing `describe('EventForm', ...)` block:

```tsx
  it('accepts a null entityId for farm-wide events and stores entity_id as null', async () => {
    const user = userEvent.setup();
    render(<EventForm entityType="farm" entityId={null} />);

    await user.type(screen.getByLabelText(/amount/i), '50');
    await user.click(screen.getByRole('button', { name: /log event/i }));

    const events = await db.events.where('entity_type').equals('farm').toArray();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ entity_id: null, event_type: 'expense', amount: 50 });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/events/EventForm.test.tsx`
Expected: FAIL — TypeScript error, `entityId={null}` is not assignable to type `string` on `EventForm`'s props.

- [ ] **Step 3: Widen the prop type**

In `src/features/events/EventForm.tsx`, change:

```tsx
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
```

to:

```tsx
export function EventForm({
  entityType,
  entityId,
  animalType,
  pigStage,
  onCreated,
}: {
  entityType: EntityType;
  entityId: string | null;
  animalType?: AnimalType;
  pigStage?: PigStage | null;
  onCreated?: () => void;
}) {
```

No other line in the file needs to change — `entityId` is only ever passed straight into `createEvent({ ..., entity_id: entityId, ... })` at line 113, and `NewEventInput.entity_id` is already `string | null`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/events/EventForm.test.tsx`
Expected: PASS (all tests in the file, including the new one)

- [ ] **Step 5: Remove the stale placeholder comment**

In `src/features/events/EventForm.tsx`, delete this comment block (directly above `FARM_EVENT_TYPES`):

```tsx
// No screen uses entityType="farm" yet: FARM_EVENT_TYPES and the farm entries in
// DEFAULT_EVENT_TYPE_BY_ENTITY below are an unused placeholder guess added only to
// satisfy Record<EntityType, ...> completeness, not a verified requirement. Whoever
// builds a farm-level events screen should revisit these rather than treat them as decided.
```

leaving just:

```tsx
const FARM_EVENT_TYPES: EventType[] = ['expense', 'sale'];
```

- [ ] **Step 6: Commit**

```bash
git add src/features/events/EventForm.tsx src/features/events/EventForm.test.tsx
git commit -m "feat: allow EventForm to log entity-less farm-wide events"
```

---

### Task 2: Build the `FarmEvents` screen

**Files:**
- Create: `src/features/farm/FarmEvents.tsx`
- Test: `src/features/farm/FarmEvents.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/farm/FarmEvents.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '../../lib/db';
import { FarmEvents } from './FarmEvents';

describe('FarmEvents', () => {
  beforeEach(async () => {
    await db.events.clear();
  });

  it('renders the log-event form and an empty history initially', () => {
    render(<FarmEvents />);

    expect(screen.getByRole('button', { name: /log event/i })).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('shows a submitted farm-wide event in history', async () => {
    const user = userEvent.setup();
    render(<FarmEvents />);

    await user.selectOptions(screen.getByLabelText(/event/i), 'expense');
    await user.type(screen.getByLabelText(/amount/i), '75');
    await user.type(screen.getByLabelText(/notes/i), 'Fuel for tractor');
    await user.click(screen.getByRole('button', { name: /log event/i }));

    expect(await screen.findByText(/expense/)).toBeInTheDocument();
    expect(screen.getByText(/75\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Fuel for tractor/)).toBeInTheDocument();
  });

  it('does not show events belonging to other entity types', async () => {
    await db.events.put({
      id: 'e1', client_id: 'e1', event_type: 'expense', entity_type: 'plot', entity_id: 'p1',
      event_date: '2026-05-01', amount: 10, category: null, notes: 'Plot expense',
      metadata: {}, created_at: '2026-05-01T00:00:00.000Z', updated_at: '2026-05-01T00:00:00.000Z', synced: 0,
    });

    render(<FarmEvents />);

    expect(screen.queryByText(/Plot expense/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/farm/FarmEvents.test.tsx`
Expected: FAIL with "Cannot find module './FarmEvents'"

- [ ] **Step 3: Write the implementation**

Create `src/features/farm/FarmEvents.tsx`:

```tsx
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { EventForm } from '../events/EventForm';

export function FarmEvents() {
  const events = useLiveQuery(
    () => db.events.where('entity_type').equals('farm').reverse().sortBy('event_date'),
    []
  );

  return (
    <div>
      <h1>Farm</h1>

      <h2>Log an event</h2>
      <EventForm entityType="farm" entityId={null} />

      <h2>History</h2>
      <ul>
        {(events ?? []).map((event) => (
          <li key={event.id}>
            {event.event_date} — {event.event_type}
            {event.amount != null ? ` — ${event.amount.toFixed(2)}` : ''}
            {event.notes ? ` — ${event.notes}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/farm/FarmEvents.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/farm/FarmEvents.tsx src/features/farm/FarmEvents.test.tsx
git commit -m "feat: add farm-wide events screen"
```

---

### Task 3: Wire up routing and navigation

**Files:**
- Modify: `src/routes.tsx`
- Modify: `src/App.tsx:31-34`

- [ ] **Step 1: Add the route**

In `src/routes.tsx`, add the import:

```tsx
import { FarmEvents } from './features/farm/FarmEvents';
```

and add the route inside `<Routes>`, after the `/plots/:id` route:

```tsx
      <Route path="/farm" element={<FarmEvents />} />
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
    </Routes>
  );
}
```

- [ ] **Step 2: Add the nav link**

In `src/App.tsx`, change:

```tsx
            <nav>
              <Link to="/animals">Animals</Link> <Link to="/batches">Batches</Link>{' '}
              <Link to="/plots">Plots</Link>
            </nav>
```

to:

```tsx
            <nav>
              <Link to="/animals">Animals</Link> <Link to="/batches">Batches</Link>{' '}
              <Link to="/plots">Plots</Link> <Link to="/farm">Farm</Link>
            </nav>
```

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — all existing tests plus the new `EventForm`/`FarmEvents` tests.

- [ ] **Step 4: Run the build**

Run: `npm run build`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes.tsx src/App.tsx
git commit -m "feat: wire up farm-wide events routing and navigation"
```

---

## Self-Review Notes

- **Spec coverage:** `EventForm` widening (spec §2) → Task 1. `FarmEvents` screen with form + history, no info header, no PENDING sentinel needed (spec §3) → Task 2. Routing/nav (spec §3) → Task 3. Testing (spec §4) → covered across Tasks 1–2. Error handling (spec §5) → no new code path, confirmed by reusing `EventForm` unchanged.
- **Out-of-scope items confirmed absent:** no `category` field added, no edit/delete, no filtering/pagination.
- **Type consistency:** `entityId: string | null` in Task 1 matches `entityId={null}` used in Task 2's `FarmEvents` and Task 1's test. `db.events.where('entity_type').equals('farm')` matches the `EntityType` union's `'farm'` value already defined in `src/lib/types.ts`.
