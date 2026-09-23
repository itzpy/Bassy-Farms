import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../../lib/db';
import { VaccinationReminders } from './VaccinationReminders';

function renderWithRouter() {
  return render(
    <MemoryRouter>
      <VaccinationReminders />
    </MemoryRouter>
  );
}

describe('VaccinationReminders', () => {
  beforeEach(async () => {
    await db.animals.clear();
    await db.events.clear();
  });

  it('renders nothing when no vaccination is due', async () => {
    renderWithRouter();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows a summary and a link to the animal when a vaccination is due', async () => {
    await db.animals.put({
      id: 'a1', type: 'pig', tag: 'P-01', birth_date: null, status: 'active', notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });
    await db.events.put({
      id: 'e1', client_id: 'e1', event_type: 'vaccination', entity_type: 'animal', entity_id: 'a1',
      event_date: '2026-01-01', amount: null, category: null, notes: null,
      // A due date far in the past so this test stays deterministic regardless of
      // the actual wall-clock date the suite runs on.
      metadata: { next_due_date: '2020-01-01' },
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });

    renderWithRouter();

    expect(await screen.findByText(/1 vaccination due/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /P-01/ });
    expect(link).toHaveAttribute('href', '/animals/a1');
  });
});
