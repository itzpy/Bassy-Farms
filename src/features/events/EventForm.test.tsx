import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '../../lib/db';
import { EventForm } from './EventForm';

describe('EventForm', () => {
  beforeEach(async () => {
    await db.events.clear();
  });

  it('logs a plain event with no feed fields when animalType is not given', async () => {
    const user = userEvent.setup();
    render(<EventForm entityType="animal" entityId="a1" />);

    expect(screen.queryByLabelText(/feed type/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /log event/i }));

    const events = await db.events.where('entity_id').equals('a1').toArray();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event_type: 'feeding', metadata: {} });
  });

  it('shows a stage dropdown defaulted to pigStage for a pig feeding, and stores feed_type/quantity_kg', async () => {
    const user = userEvent.setup();
    render(<EventForm entityType="animal" entityId="a2" animalType="pig" pigStage="grower" />);

    const feedTypeSelect = screen.getByLabelText(/feed type/i);
    expect(feedTypeSelect).toHaveValue('grower');

    await user.selectOptions(feedTypeSelect, 'finisher');
    await user.type(screen.getByLabelText(/quantity/i), '5');
    await user.click(screen.getByRole('button', { name: /log event/i }));

    const events = await db.events.where('entity_id').equals('a2').toArray();
    expect(events).toHaveLength(1);
    expect(events[0].metadata).toMatchObject({ feed_type: 'finisher', quantity_kg: 5 });
  });

  it('shows a free-text feed type input for a goat feeding, and stores it', async () => {
    const user = userEvent.setup();
    render(<EventForm entityType="animal" entityId="a3" animalType="goat" />);

    const feedTypeInput = screen.getByLabelText(/feed type/i);
    expect(feedTypeInput).toHaveValue('');

    await user.type(feedTypeInput, 'Hay');
    await user.type(screen.getByLabelText(/quantity/i), '2.5');
    await user.click(screen.getByRole('button', { name: /log event/i }));

    const events = await db.events.where('entity_id').equals('a3').toArray();
    expect(events).toHaveLength(1);
    expect(events[0].metadata).toMatchObject({ feed_type: 'Hay', quantity_kg: 2.5 });
  });

  it('does not show feed fields for a non-feeding event type', async () => {
    const user = userEvent.setup();
    render(<EventForm entityType="animal" entityId="a4" animalType="pig" pigStage="starter" />);

    await user.selectOptions(screen.getByLabelText(/event/i), 'vaccination');

    expect(screen.queryByLabelText(/feed type/i)).not.toBeInTheDocument();
  });
});
