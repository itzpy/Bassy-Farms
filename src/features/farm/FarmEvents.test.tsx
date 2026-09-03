import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '../../lib/db';
import { FarmEvents } from './FarmEvents';

describe('FarmEvents', () => {
  beforeEach(async () => {
    await db.events.clear();
  });

  it('renders the log-event form and an empty history initially', () => {
    render(<FarmEvents />);

    expect(screen.getByRole('button', { name: /log event/i })).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('shows a submitted farm-wide event in history', async () => {
    const user = userEvent.setup();
    render(<FarmEvents />);

    await user.selectOptions(screen.getByLabelText(/event/i), 'expense');
    await user.type(screen.getByLabelText(/amount/i), '75');
    await user.type(screen.getByLabelText(/notes/i), 'Fuel for tractor');
    await user.click(screen.getByRole('button', { name: /log event/i }));

    expect(await screen.findByText(/expense —/)).toBeInTheDocument();
    expect(screen.getByText(/75\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Fuel for tractor/)).toBeInTheDocument();
  });

  it('does not show events belonging to other entity types', async () => {
    await db.events.put({
      id: 'e1', client_id: 'e1', event_type: 'expense', entity_type: 'plot', entity_id: 'p1',
      event_date: '2026-05-01', amount: 10, category: null, notes: 'Plot expense',
      metadata: {}, created_at: '2026-05-01T00:00:00.000Z', updated_at: '2026-05-01T00:00:00.000Z', synced: 0,
    });

    render(<FarmEvents />);

    expect(screen.queryByText(/Plot expense/)).not.toBeInTheDocument();
  });
});
