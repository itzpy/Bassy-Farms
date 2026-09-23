import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

    // fake-indexeddb resolves via a macrotask rather than a microtask, so the
    // onSaved callback can lag a tick behind the click resolving (see
    // EventForm.test.tsx and AnimalForm.test.tsx for the same pattern).
    await waitFor(() => expect(saved).toBe(true));
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
