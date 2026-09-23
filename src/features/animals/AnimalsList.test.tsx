import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../../lib/db';
import { AnimalsList } from './AnimalsList';

describe('AnimalsList', () => {
  beforeEach(async () => {
    await db.animals.clear();
  });

  it('adds a new animal and shows it in the list', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AnimalsList />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/tag/i), 'P-01');
    await user.selectOptions(screen.getByLabelText(/type/i), 'pig');
    await user.click(screen.getByRole('button', { name: /add animal/i }));

    expect(await screen.findByText('P-01')).toBeInTheDocument();
  });

  it('does not show a deleted animal', async () => {
    await db.animals.put({
      id: 'a1', type: 'pig', tag: 'P-99', birth_date: null, status: 'active', notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
      deleted_at: '2026-01-02T00:00:00.000Z',
    });

    render(
      <MemoryRouter>
        <AnimalsList />
      </MemoryRouter>
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText('P-99')).not.toBeInTheDocument();
  });
});
