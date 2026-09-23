import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db, type LocalEvent } from '../../lib/db';
import { EventHistoryList } from './EventHistoryList';

function makeEvent(overrides: Partial<LocalEvent>): LocalEvent {
  return {
    id: 'e1', client_id: 'e1', event_type: 'expense', entity_type: 'farm', entity_id: null,
    event_date: '2026-01-01', amount: 10, category: null, notes: null, metadata: {},
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    ...overrides,
  };
}

describe('EventHistoryList', () => {
  beforeEach(async () => {
    await db.events.clear();
  });

  it('renders each event with Edit and Delete buttons', () => {
    const events = [makeEvent({ id: 'e1' }), makeEvent({ id: 'e2', event_date: '2026-01-02' })];
    render(<EventHistoryList events={events} entityType="farm" entityId={null} />);

    expect(screen.getAllByRole('button', { name: /^edit$/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /delete/i })).toHaveLength(2);
  });

  it('Edit swaps only that row into an EventForm pre-filled from the event, leaving siblings untouched', async () => {
    await db.events.put(makeEvent({ id: 'e1', notes: 'first' }));
    await db.events.put(makeEvent({ id: 'e2', notes: 'second' }));
    const events = await db.events.toArray();
    const user = userEvent.setup();
    render(<EventHistoryList events={events} entityType="farm" entityId={null} />);

    await user.click(screen.getAllByRole('button', { name: /^edit$/i })[0]);

    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    expect(screen.getByText(/second/)).toBeInTheDocument();
  });

  it('saving an edit updates that row and collapses back to the plain line', async () => {
    await db.events.put(makeEvent({ id: 'e1', notes: 'before' }));
    const events = await db.events.toArray();
    const user = userEvent.setup();
    const { rerender } = render(<EventHistoryList events={events} entityType="farm" entityId={null} />);

    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    await user.clear(screen.getByLabelText(/notes/i));
    await user.type(screen.getByLabelText(/notes/i), 'after');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    const updated = await db.events.toArray();
    expect(updated[0].notes).toBe('after');
    rerender(<EventHistoryList events={updated} entityType="farm" entityId={null} />);
    expect(screen.getByText(/after/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
  });

  it('Delete asks for confirmation, and only deletes when confirmed', async () => {
    await db.events.put(makeEvent({ id: 'e1' }));
    const events = await db.events.toArray();
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<EventHistoryList events={events} entityType="farm" entityId={null} />);

    await user.click(screen.getByRole('button', { name: /delete/i }));
    let stored = await db.events.get('e1');
    expect(stored!.deleted_at).toBeFalsy();

    confirmSpy.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: /delete/i }));
    stored = await db.events.get('e1');
    expect(stored!.deleted_at).toBeTruthy();
  });

  it('applies a custom formatDetail function per event', () => {
    const events = [makeEvent({ id: 'e1', event_type: 'feeding', metadata: { feed_type: 'starter' } })];
    render(
      <EventHistoryList
        events={events}
        entityType="animal"
        entityId="a1"
        formatDetail={(e) => (typeof e.metadata.feed_type === 'string' ? e.metadata.feed_type : '')}
      />
    );

    expect(screen.getByText(/starter/)).toBeInTheDocument();
  });
});
