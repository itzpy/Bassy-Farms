import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../../lib/db';
import { BatchesList } from './BatchesList';

describe('BatchesList', () => {
  beforeEach(async () => {
    await db.batches.clear();
  });

  it('adds a new batch and shows it in the list', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <BatchesList />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/name/i), 'Batch A');
    await user.type(screen.getByLabelText(/initial headcount/i), '10');
    await user.click(screen.getByRole('button', { name: /add batch/i }));

    expect(await screen.findByText('Batch A')).toBeInTheDocument();
  });

  it('does not show a deleted batch', async () => {
    await db.batches.put({
      id: 'b1', name: 'Deleted Batch', purchase_date: '2026-01-01', initial_count: 5, purchase_cost: null, notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
      deleted_at: '2026-01-02T00:00:00.000Z',
    });

    render(
      <MemoryRouter>
        <BatchesList />
      </MemoryRouter>
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText('Deleted Batch')).not.toBeInTheDocument();
  });
});
