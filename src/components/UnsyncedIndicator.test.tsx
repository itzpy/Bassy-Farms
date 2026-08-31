import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { db } from '../lib/db';
import { UnsyncedIndicator } from './UnsyncedIndicator';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

describe('UnsyncedIndicator', () => {
  beforeEach(async () => {
    await db.animals.clear();
    await db.plots.clear();
    await db.events.clear();
  });

  it('renders nothing when there are no unsynced records', async () => {
    render(<UnsyncedIndicator pollIntervalMs={10} />);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows a visible count when there are unsynced records', async () => {
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
    await db.events.put({
      id: 'e1',
      client_id: 'e1',
      event_type: 'feeding',
      entity_type: 'animal',
      entity_id: 'a1',
      event_date: '2026-01-01',
      amount: null,
      category: null,
      notes: null,
      metadata: {},
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      synced: 0,
    });

    render(<UnsyncedIndicator pollIntervalMs={10} />);

    expect(await screen.findByText(/2 unsynced changes/i)).toBeInTheDocument();
  });
});
