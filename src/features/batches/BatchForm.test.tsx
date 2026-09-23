import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '../../lib/db';
import { BatchForm } from './BatchForm';

describe('BatchForm', () => {
  beforeEach(async () => {
    await db.batches.clear();
  });

  it('in edit mode, pre-fills from the given batch and saves changes via update, not create', async () => {
    await db.batches.put({
      id: 'b1', name: 'Batch A', purchase_date: '2026-01-01', initial_count: 10, purchase_cost: 500, notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });
    const batch = (await db.batches.get('b1'))!;
    const user = userEvent.setup();
    let saved = false;
    render(<BatchForm editing={batch} onSaved={() => { saved = true; }} />);

    expect(screen.getByLabelText(/name/i)).toHaveValue('Batch A');
    expect(screen.getByLabelText(/initial headcount/i)).toHaveValue(10);
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/name/i));
    await user.type(screen.getByLabelText(/name/i), 'Batch A renamed');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    // fake-indexeddb can resolve via macrotask rather than microtask here, so wrap in waitFor
    await waitFor(() => expect(saved).toBe(true));
    const all = await db.batches.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: 'b1', name: 'Batch A renamed' });
  });

  it('Cancel calls onSaved without changing the record', async () => {
    await db.batches.put({
      id: 'b2', name: 'Batch B', purchase_date: '2026-01-01', initial_count: 5, purchase_cost: null, notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });
    const batch = (await db.batches.get('b2'))!;
    const user = userEvent.setup();
    let saved = false;
    render(<BatchForm editing={batch} onSaved={() => { saved = true; }} />);

    await user.clear(screen.getByLabelText(/name/i));
    await user.type(screen.getByLabelText(/name/i), 'should not save');
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(saved).toBe(true);
    const stored = await db.batches.get('b2');
    expect(stored!.name).toBe('Batch B');
  });
});
