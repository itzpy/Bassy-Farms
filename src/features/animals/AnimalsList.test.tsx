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
});
