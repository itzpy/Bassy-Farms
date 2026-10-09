import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { db } from '../../lib/db';
import { toLocalDateString } from '../../lib/dates';
import { ProfitabilityDashboard } from './ProfitabilityDashboard';

describe('ProfitabilityDashboard', () => {
  beforeEach(async () => {
    await db.animals.clear();
    await db.batches.clear();
    await db.events.clear();
  });

  it('shows totals for a mixed fixture within the default (this-month) range', async () => {
    const today = toLocalDateString(new Date());

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

    expect(await screen.findByText('GH₵30.00', { selector: 'dd' })).toBeInTheDocument();
    // A loss is signed with a true minus and labelled in words, not colour alone.
    expect(screen.getByText('Loss', { selector: 'dt' })).toBeInTheDocument();
    expect(screen.getAllByText(/\u2212GH₵30\.00/).length).toBeGreaterThan(0);
    // Pigs row and the Overall row both show the cost.
    expect(screen.getAllByRole('cell', { name: 'GH₵30.00' })).toHaveLength(2);
    expect(screen.getByRole('rowheader', { name: 'Pigs' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Overall' })).toBeInTheDocument();
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

    expect(await screen.findByText('GH₵50.00', { selector: 'dd' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/to/i), { target: { value: '2026-02-14' } });

    expect(await screen.findByText(/No income or costs logged/)).toBeInTheDocument();
  });

  it('excludes a deleted event from totals', async () => {
    const today = toLocalDateString(new Date());

    await db.events.put({
      id: 'e1', client_id: 'e1', event_type: 'expense', entity_type: 'farm', entity_id: null,
      event_date: today, amount: 999, category: null, notes: null, metadata: {},
      created_at: today + 'T00:00:00.000Z', updated_at: today + 'T00:00:00.000Z', synced: 0,
      deleted_at: today + 'T01:00:00.000Z',
    });

    render(<ProfitabilityDashboard />);

    expect(await screen.findByText(/No income or costs logged/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('warns and shows no figures when the end date precedes the start date', async () => {
    render(<ProfitabilityDashboard />);

    fireEvent.change(screen.getByLabelText(/from/i), { target: { value: '2026-03-10' } });
    fireEvent.change(screen.getByLabelText(/to/i), { target: { value: '2026-03-01' } });

    expect(await screen.findByRole('alert')).toHaveTextContent(/end date on or after the start date/i);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('applies the Last month preset and marks it pressed', async () => {
    render(<ProfitabilityDashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Last month' }));

    expect(screen.getByRole('button', { name: 'Last month' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'This month' })).toHaveAttribute('aria-pressed', 'false');
    const from = (screen.getByLabelText(/from/i) as HTMLInputElement).value;
    expect(from.endsWith('-01')).toBe(true);
  });
});
