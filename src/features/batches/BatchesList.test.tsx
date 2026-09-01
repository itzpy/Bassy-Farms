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
});
