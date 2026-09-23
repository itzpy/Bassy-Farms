import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../../lib/db';
import { PlotsList } from './PlotsList';

describe('PlotsList', () => {
  beforeEach(async () => {
    await db.plots.clear();
  });

  it('adds a new plot and shows it in the list', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PlotsList />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/name/i), 'North Field');
    await user.click(screen.getByRole('button', { name: /add plot/i }));

    expect(await screen.findByText('North Field')).toBeInTheDocument();
  });

  it('does not show a deleted plot', async () => {
    await db.plots.put({
      id: 'p1', name: 'Deleted Field', crop_type: null, planted_date: null, area: null, notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
      deleted_at: '2026-01-02T00:00:00.000Z',
    });

    render(
      <MemoryRouter>
        <PlotsList />
      </MemoryRouter>
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText('Deleted Field')).not.toBeInTheDocument();
  });
});
