import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '../../lib/db';
import { AnimalForm } from './AnimalForm';

describe('AnimalForm', () => {
  beforeEach(async () => {
    await db.animals.clear();
  });

  it('in edit mode, pre-fills from the given animal and saves changes via update, not create', async () => {
    await db.animals.put({
      id: 'a1', type: 'pig', tag: 'P-01', birth_date: null, status: 'active', notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });
    const animal = (await db.animals.get('a1'))!;
    const user = userEvent.setup();
    let saved = false;
    render(<AnimalForm editing={animal} onSaved={() => { saved = true; }} />);

    expect(screen.getByLabelText(/tag/i)).toHaveValue('P-01');
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/tag/i));
    await user.type(screen.getByLabelText(/tag/i), 'P-01-renamed');
    await user.selectOptions(screen.getByLabelText(/type/i), 'goat');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    // The onSaved callback fires after the Dexie/fake-indexeddb write resolves,
    // which (like elsewhere in this codebase, see EventForm.test.tsx) settles
    // via a macrotask rather than a microtask, so it isn't guaranteed to have
    // run by the time `user.click` resolves. Wait for it explicitly.
    await waitFor(() => expect(saved).toBe(true));
    const all = await db.animals.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: 'a1', tag: 'P-01-renamed', type: 'goat' });
  });

  it('Cancel calls onSaved without changing the record', async () => {
    await db.animals.put({
      id: 'a2', type: 'pig', tag: 'P-02', birth_date: null, status: 'active', notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });
    const animal = (await db.animals.get('a2'))!;
    const user = userEvent.setup();
    let saved = false;
    render(<AnimalForm editing={animal} onSaved={() => { saved = true; }} />);

    await user.clear(screen.getByLabelText(/tag/i));
    await user.type(screen.getByLabelText(/tag/i), 'should not save');
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(saved).toBe(true);
    const stored = await db.animals.get('a2');
    expect(stored!.tag).toBe('P-02');
  });
});
