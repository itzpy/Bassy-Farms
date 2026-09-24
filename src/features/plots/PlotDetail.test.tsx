import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
  });
});
