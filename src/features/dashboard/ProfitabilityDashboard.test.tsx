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
