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
});
