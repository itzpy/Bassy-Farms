# Vaccination Due Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a vaccination event record an optional "next due date," and surface a global in-app banner listing any active animal whose most recent vaccination is due or overdue — the first slice of the PRD's V3 "reminders/notifications" milestone.

**Architecture:** A new optional `metadata.next_due_date` field on `vaccination` events (added to `EventForm`), a pure function (`getDueVaccinations`) that derives "who's due" from the existing event log at read time (no denormalized state), a global banner component mirroring `UnsyncedIndicator`'s pattern, and a small formatting addition to `AnimalDetail`'s history line.

**Tech Stack:** React, TypeScript, Dexie (`dexie-react-hooks`), React Router, Vitest + Testing Library.

---

### Task 1: `EventForm` — "Next due date" field for vaccinations

**Files:**
- Modify: `src/features/events/EventForm.tsx`
- Test: `src/features/events/EventForm.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `src/features/events/EventForm.test.tsx`, inside the existing `describe('EventForm', ...)` block:

```tsx
  it('shows a next due date field only for vaccination events, and stores it as metadata.next_due_date', async () => {
    const user = userEvent.setup();
    render(<EventForm entityType="animal" entityId="a10" animalType="pig" pigStage="starter" />);

    await user.selectOptions(screen.getByLabelText(/event/i), 'vaccination');
    fireEvent.change(screen.getByLabelText(/next due date/i), { target: { value: '2026-12-01' } });
    await user.click(screen.getByRole('button', { name: /log event/i }));

    const events = await db.events.where('entity_id').equals('a10').toArray();
    expect(events).toHaveLength(1);
    expect(events[0].metadata).toMatchObject({ next_due_date: '2026-12-01' });
  });

  it('does not show a next due date field for a non-vaccination event', async () => {
    render(<EventForm entityType="animal" entityId="a11" animalType="pig" pigStage="starter" />);

    expect(screen.queryByLabelText(/next due date/i)).not.toBeInTheDocument();
  });

  it('omits next_due_date from metadata when left blank', async () => {
    const user = userEvent.setup();
    render(<EventForm entityType="animal" entityId="a12" animalType="pig" pigStage="starter" />);

    await user.selectOptions(screen.getByLabelText(/event/i), 'vaccination');
    await user.click(screen.getByRole('button', { name: /log event/i }));

    const events = await db.events.where('entity_id').equals('a12').toArray();
    expect(events).toHaveLength(1);
    expect(events[0].metadata).not.toHaveProperty('next_due_date');
  });
```

(`fireEvent` is already imported in this file — it's used by the existing negative-quantity test.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/events/EventForm.test.tsx`
Expected: FAIL — `getByLabelText(/next due date/i)` finds nothing (field doesn't exist yet).

- [ ] **Step 3: Add the field**

In `src/features/events/EventForm.tsx`:

Add a new derived boolean alongside the other `show*` flags (after `showInputFields`):

```tsx
  const showVaccinationDueField = eventType === 'vaccination';
```

Add a new state variable alongside the other field states (after `inputUnit`'s `useState`):

```tsx
  const [nextDueDate, setNextDueDate] = useState('');
```

In `buildMetadata()`, add a new branch (after the `showInputFields` block, before `return metadata;`):

```tsx
    if (showVaccinationDueField && nextDueDate.trim()) {
      metadata.next_due_date = nextDueDate;
    }
```

In `handleSubmit`'s success path, reset the field alongside the other resets (after `setInputQuantity('');`):

```tsx
      setNextDueDate('');
```

In the JSX, add a new conditional block (after the `showInputFields` block, before `showAmountField`):

```tsx
      {showVaccinationDueField && (
        <>
          <label htmlFor="vaccination-due-date">Next due date</label>
          <input
            id="vaccination-due-date"
            type="date"
            value={nextDueDate}
            onChange={(e) => setNextDueDate(e.target.value)}
          />
        </>
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/events/EventForm.test.tsx`
Expected: PASS (all tests in the file, including the 3 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/features/events/EventForm.tsx src/features/events/EventForm.test.tsx
git commit -m "feat: add next-due-date field to vaccination events"
```

---

### Task 2: `getDueVaccinations` pure function

**Files:**
- Create: `src/features/reminders/dueVaccinations.ts`
- Test: `src/features/reminders/dueVaccinations.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/features/reminders/dueVaccinations.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getDueVaccinations } from './dueVaccinations';
import type { LocalEvent, LocalAnimal } from '../../lib/db';

function makeEvent(overrides: Partial<LocalEvent>): LocalEvent {
  return {
    id: 'e', client_id: 'e', event_type: 'vaccination', entity_type: 'animal', entity_id: 'a1',
    event_date: '2026-01-01', amount: null, category: null, notes: null, metadata: {},
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
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

describe('getDueVaccinations', () => {
  it('returns an empty array for empty input', () => {
    expect(getDueVaccinations([], [], '2026-06-01')).toEqual([]);
  });

  it('excludes a vaccination with no next_due_date', () => {
    const events = [makeEvent({ metadata: {} })];
    expect(getDueVaccinations(events, [makeAnimal({})], '2026-06-01')).toEqual([]);
  });

  it('excludes a next_due_date in the future', () => {
    const events = [makeEvent({ metadata: { next_due_date: '2026-12-01' } })];
    expect(getDueVaccinations(events, [makeAnimal({})], '2026-06-01')).toEqual([]);
  });

  it('includes a next_due_date exactly today or in the past', () => {
    const today = [makeEvent({ id: 'e1', metadata: { next_due_date: '2026-06-01' } })];
    expect(getDueVaccinations(today, [makeAnimal({})], '2026-06-01')).toHaveLength(1);

    const past = [makeEvent({ id: 'e1', metadata: { next_due_date: '2026-01-01' } })];
    expect(getDueVaccinations(past, [makeAnimal({})], '2026-06-01')).toHaveLength(1);
  });

  it('uses only the latest vaccination event per animal', () => {
    const events = [
      makeEvent({ id: 'old', event_date: '2026-01-01', metadata: { next_due_date: '2026-02-01' } }),
      makeEvent({ id: 'new', event_date: '2026-03-01', metadata: {} }),
    ];
    // The latest event has no next_due_date, so nothing should be due, even though
    // an earlier vaccination's due date has since passed.
    expect(getDueVaccinations(events, [makeAnimal({})], '2026-06-01')).toEqual([]);
  });

  it('excludes an inactive animal even with a past-due date', () => {
    const events = [makeEvent({ metadata: { next_due_date: '2026-01-01' } })];
    const animals = [makeAnimal({ status: 'sold' })];
    expect(getDueVaccinations(events, animals, '2026-06-01')).toEqual([]);
  });

  it('sorts results by dueDate ascending', () => {
    const events = [
      makeEvent({ id: 'e1', entity_id: 'a1', metadata: { next_due_date: '2026-05-01' } }),
      makeEvent({ id: 'e2', entity_id: 'a2', metadata: { next_due_date: '2026-01-01' } }),
    ];
    const animals = [
      makeAnimal({ id: 'a1', tag: 'P-01' }),
      makeAnimal({ id: 'a2', tag: 'P-02' }),
    ];

    const result = getDueVaccinations(events, animals, '2026-06-01');
    expect(result.map((r) => r.tag)).toEqual(['P-02', 'P-01']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/reminders/dueVaccinations.test.ts`
Expected: FAIL with "Cannot find module './dueVaccinations'"

- [ ] **Step 3: Write the implementation**

Create `src/features/reminders/dueVaccinations.ts`:

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
): DueVaccination[] {
  const animalById = new Map(animals.map((a) => [a.id, a]));

  const latestByAnimal = new Map<string, LocalEvent>();
  for (const event of events) {
    if (event.event_type !== 'vaccination' || !event.entity_id) continue;
    const current = latestByAnimal.get(event.entity_id);
    if (!current || event.event_date > current.event_date) {
      latestByAnimal.set(event.entity_id, event);
    }
  }

  const due: DueVaccination[] = [];
  for (const [animalId, event] of latestByAnimal) {
    const dueDate = event.metadata.next_due_date;
    if (typeof dueDate !== 'string') continue;
    if (dueDate > today) continue;
    const animal = animalById.get(animalId);
    if (!animal || animal.status !== 'active') continue;
    due.push({ animalId, tag: animal.tag, dueDate });
  }

  return due.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/reminders/dueVaccinations.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/reminders/dueVaccinations.ts src/features/reminders/dueVaccinations.test.ts
git commit -m "feat: add due-vaccination lookup function"
```

---

### Task 3: `VaccinationReminders` global banner

**Files:**
- Create: `src/features/reminders/VaccinationReminders.tsx`
- Test: `src/features/reminders/VaccinationReminders.test.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/reminders/VaccinationReminders.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../../lib/db';
import { VaccinationReminders } from './VaccinationReminders';

function renderWithRouter() {
  return render(
    <MemoryRouter>
      <VaccinationReminders />
    </MemoryRouter>
  );
}

describe('VaccinationReminders', () => {
  beforeEach(async () => {
    await db.animals.clear();
    await db.events.clear();
  });

  it('renders nothing when no vaccination is due', async () => {
    renderWithRouter();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows a summary and a link to the animal when a vaccination is due', async () => {
    await db.animals.put({
      id: 'a1', type: 'pig', tag: 'P-01', birth_date: null, status: 'active', notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });
    await db.events.put({
      id: 'e1', client_id: 'e1', event_type: 'vaccination', entity_type: 'animal', entity_id: 'a1',
      event_date: '2026-01-01', amount: null, category: null, notes: null,
      // A due date far in the past so this test stays deterministic regardless of
      // the actual wall-clock date the suite runs on.
      metadata: { next_due_date: '2020-01-01' },
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });

    renderWithRouter();

    expect(await screen.findByText(/1 vaccination due/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /P-01/ });
    expect(link).toHaveAttribute('href', '/animals/a1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/reminders/VaccinationReminders.test.tsx`
Expected: FAIL with "Cannot find module './VaccinationReminders'"

- [ ] **Step 3: Write the implementation**

Create `src/features/reminders/VaccinationReminders.tsx`:

```tsx
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../../lib/db';
import { getDueVaccinations } from './dueVaccinations';

export function VaccinationReminders() {
  const events = useLiveQuery(() => db.events.where('event_type').equals('vaccination').toArray());
  const animals = useLiveQuery(() => db.animals.toArray());

  const today = new Date().toISOString().slice(0, 10);
  const due = getDueVaccinations(events ?? [], animals ?? [], today);

  if (due.length === 0) return null;

  return (
    <div role="status">
      <p>
        {due.length} vaccination{due.length === 1 ? '' : 's'} due
      </p>
      <ul>
        {due.map((item) => (
          <li key={item.animalId}>
            <Link to={`/animals/${item.animalId}`}>
              {item.tag} — due {item.dueDate}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/reminders/VaccinationReminders.test.tsx`
Expected: PASS (both tests)

- [ ] **Step 5: Mount it in `App.tsx`**

In `src/App.tsx`, add the import:

```tsx
import { VaccinationReminders } from './features/reminders/VaccinationReminders';
```

and mount it directly after `<UnsyncedIndicator />`:

```tsx
            <UnsyncedIndicator />
            <VaccinationReminders />
```

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — all existing tests plus the new ones.

- [ ] **Step 7: Commit**

```bash
git add src/features/reminders/VaccinationReminders.tsx src/features/reminders/VaccinationReminders.test.tsx src/App.tsx
git commit -m "feat: add vaccination due reminders banner"
```

---

### Task 4: `AnimalDetail` history line shows next-due date

**Files:**
- Modify: `src/features/animals/AnimalDetail.tsx`
- Test: `src/features/animals/AnimalDetail.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `src/features/animals/AnimalDetail.test.tsx`, inside the existing `describe('AnimalDetail', ...)` block:

```tsx
  it('shows next due date in the history line for a vaccination event with metadata', async () => {
    await db.animals.put({
      id: 'a5', type: 'goat', tag: 'G-05', birth_date: null, status: 'active', notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });
    await db.events.put({
      id: 'e1', client_id: 'e1', event_type: 'vaccination', entity_type: 'animal', entity_id: 'a5',
      event_date: '2026-01-05', amount: null, category: null, notes: null,
      metadata: { next_due_date: '2026-07-05' },
      created_at: '2026-01-05T00:00:00.000Z', updated_at: '2026-01-05T00:00:00.000Z', synced: 0,
    });

    renderAt('a5');

    expect(await screen.findByText(/next due 2026-07-05/)).toBeInTheDocument();
  });

  it('does not show a next-due suffix for a vaccination event without metadata', async () => {
    await db.animals.put({
      id: 'a6', type: 'goat', tag: 'G-06', birth_date: null, status: 'active', notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });
    await db.events.put({
      id: 'e1', client_id: 'e1', event_type: 'vaccination', entity_type: 'animal', entity_id: 'a6',
      event_date: '2026-01-05', amount: null, category: null, notes: null, metadata: {},
      created_at: '2026-01-05T00:00:00.000Z', updated_at: '2026-01-05T00:00:00.000Z', synced: 0,
    });

    renderAt('a6');

    expect(await screen.findByText(/vaccination/)).toBeInTheDocument();
    expect(screen.queryByText(/next due/)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/animals/AnimalDetail.test.tsx`
Expected: FAIL — the "next due 2026-07-05" text never appears.

- [ ] **Step 3: Add the formatter and wire it into the history line**

In `src/features/animals/AnimalDetail.tsx`, add a new function alongside `formatFeedDetail`:

```tsx
function formatVaccinationDetail(event: LocalEvent): string {
  if (event.event_type !== 'vaccination') return '';
  const dueDate = typeof event.metadata.next_due_date === 'string' ? event.metadata.next_due_date : null;
  return dueDate ? `next due ${dueDate}` : '';
}
```

In the history `<ul>`'s `.map()`, compute it alongside `feedDetail` and render it:

```tsx
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/animals/AnimalDetail.test.tsx`
Expected: PASS (all tests in the file, including the 2 new ones)

- [ ] **Step 5: Run the full test suite and the build**

Run: `npx vitest run`
Expected: PASS — all tests.

Run: `npm run build`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/animals/AnimalDetail.tsx src/features/animals/AnimalDetail.test.tsx
git commit -m "feat: show next-due date in animal vaccination history"
```

---

## Self-Review Notes

- **Spec coverage:** `EventForm` field (spec §1) → Task 1. `getDueVaccinations` (spec §2) → Task 2. `VaccinationReminders` banner + mounting (spec §3) → Task 3. `AnimalDetail` history line (spec §4) → Task 4. Testing (spec §5) → covered across all four tasks matching each listed case. Error handling (spec §6, "total function, no throws, missing-animal case naturally skipped") → Task 2's implementation has no throwing paths.
- **Out-of-scope items confirmed absent:** no push notifications, no generalization to other event types, no auto-computed schedules, no edit/delete, no denormalized field on `Animal`.
- **Type consistency:** `DueVaccination { animalId, tag, dueDate }` from Task 2 is consumed identically in Task 3's component (`item.animalId`, `item.tag`, `item.dueDate` match exactly). `metadata.next_due_date` is written as a plain string by Task 1's `EventForm`, read as a plain string by both Task 2's `getDueVaccinations` (`typeof dueDate !== 'string'` guard) and Task 4's `formatVaccinationDetail` (`typeof event.metadata.next_due_date === 'string'` guard) — same field name, same shape, no mismatch.
