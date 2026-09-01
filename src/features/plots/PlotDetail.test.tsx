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
