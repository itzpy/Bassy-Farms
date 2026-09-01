import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { db } from '../../lib/db';
import { BatchDetail } from './BatchDetail';

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/batches/${id}`]}>
      <Routes>
        <Route path="/batches/:id" element={<BatchDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('BatchDetail', () => {
  beforeEach(async () => {
    await db.batches.clear();
    await db.events.clear();
  });

  it('shows the batch once loaded, for a valid id', async () => {
    await db.batches.put({
      id: 'b1',
      name: 'Batch A',
      purchase_date: '2026-01-01',
      initial_count: 10,
      purchase_cost: 500,
      notes: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      synced: 0,
    });

    renderAt('b1');

    expect(await screen.findByText(/Batch A/)).toBeInTheDocument();
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it('shows a not-found message for a nonexistent id', async () => {
    renderAt('does-not-exist');

    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
  });

  it('computes current headcount and profit from sale/expense/death events', async () => {
    await db.batches.put({
      id: 'b2',
      name: 'Batch B',
      purchase_date: '2026-01-01',
      initial_count: 10,
      purchase_cost: 500,
      notes: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      synced: 0,
    });
    await db.events.put({
      id: 'e1', client_id: 'e1', event_type: 'expense', entity_type: 'batch', entity_id: 'b2',
      event_date: '2026-02-01', amount: 100, category: null, notes: null, metadata: {},
      created_at: '2026-02-01T00:00:00.000Z', updated_at: '2026-02-01T00:00:00.000Z', synced: 0,
    });
    await db.events.put({
      id: 'e2', client_id: 'e2', event_type: 'sale', entity_type: 'batch', entity_id: 'b2',
      event_date: '2026-03-01', amount: 300, category: null, notes: null, metadata: { quantity: 3 },
      created_at: '2026-03-01T00:00:00.000Z', updated_at: '2026-03-01T00:00:00.000Z', synced: 0,
    });
    await db.events.put({
      id: 'e3', client_id: 'e3', event_type: 'death', entity_type: 'batch', entity_id: 'b2',
      event_date: '2026-03-05', amount: null, category: null, notes: null, metadata: { quantity: 1 },
      created_at: '2026-03-05T00:00:00.000Z', updated_at: '2026-03-05T00:00:00.000Z', synced: 0,
    });

    renderAt('b2');

    await screen.findByText(/Batch B/);
    // 10 initial - 3 sold - 1 died = 6
    expect(await screen.findByText(/current headcount: 6/i)).toBeInTheDocument();
    // total cost = 500 purchase + 100 expense = 600; revenue = 300; profit = -300
    expect(screen.getByText(/total cost: 600/i)).toBeInTheDocument();
    expect(screen.getByText(/total revenue: 300/i)).toBeInTheDocument();
    expect(screen.getByText(/profit: -300/i)).toBeInTheDocument();
    expect(screen.getByText(/3 pigs/)).toBeInTheDocument();
  });
});
