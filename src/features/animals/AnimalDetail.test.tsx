import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { db } from '../../lib/db';
import { AnimalDetail } from './AnimalDetail';

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/animals/${id}`]}>
      <Routes>
        <Route path="/animals/:id" element={<AnimalDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AnimalDetail', () => {
  beforeEach(async () => {
    await db.animals.clear();
    await db.events.clear();
  });

  it('shows the animal once loaded, for a valid id', async () => {
    await db.animals.put({
      id: 'a1',
      type: 'pig',
      tag: 'P-01',
      birth_date: null,
      status: 'active',
      notes: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      synced: 0,
    });

    renderAt('a1');

    expect(await screen.findByText(/P-01/)).toBeInTheDocument();
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it('shows a not-found message for a nonexistent id, instead of loading forever', async () => {
    renderAt('does-not-exist');

    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

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
});
