import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { db } from '../../lib/db';
import { AnimalDetail } from './AnimalDetail';

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/animals/${id}`]}>
      <Routes>
        <Route path="/animals/:id" element={<AnimalDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AnimalDetail', () => {
  beforeEach(async () => {
    await db.animals.clear();
    await db.events.clear();
  });

  it('shows the animal once loaded, for a valid id', async () => {
    await db.animals.put({
      id: 'a1',
      type: 'pig',
      tag: 'P-01',
      birth_date: null,
      status: 'active',
      notes: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      synced: 0,
    });

    renderAt('a1');

    expect(await screen.findByText(/P-01/)).toBeInTheDocument();
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it('shows a not-found message for a nonexistent id, instead of loading forever', async () => {
    renderAt('does-not-exist');

    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });
});
