import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
