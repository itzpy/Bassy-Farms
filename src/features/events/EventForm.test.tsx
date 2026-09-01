import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db, type LocalEvent } from '../../lib/db';
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

  it('omits quantity_kg from metadata when a negative value is entered', async () => {
    const user = userEvent.setup();
    render(<EventForm entityType="animal" entityId="a5" animalType="goat" />);

    await user.type(screen.getByLabelText(/feed type/i), 'Hay');
    const qtyInput = screen.getByLabelText(/quantity/i) as HTMLInputElement;
    await user.type(qtyInput, '-3');
    expect(qtyInput.value).toBe('-3');

    // The native `min="0"` constraint makes jsdom (like a real browser) block
    // submission via a click on the submit button before React's onSubmit
    // ever runs, so this dispatches the `submit` event directly to exercise
    // handleSubmit -> buildMetadata()'s negative-value rejection.
    const form = qtyInput.closest('form');
    if (!form) throw new Error('form not found');
    fireEvent.submit(form);

    let events: LocalEvent[] = [];
    await waitFor(async () => {
      events = await db.events.where('entity_id').equals('a5').toArray();
      expect(events).toHaveLength(1);
    });
    expect(events[0].metadata).toMatchObject({ feed_type: 'Hay' });
    expect(events[0].metadata).not.toHaveProperty('quantity_kg');
  });

  it('shows an amount field for expense/sale events on any entity type, and stores it', async () => {
    const user = userEvent.setup();
    render(<EventForm entityType="animal" entityId="a6" />);

    await user.selectOptions(screen.getByLabelText(/event/i), 'expense');
    await user.type(screen.getByLabelText(/amount/i), '25.50');
    await user.click(screen.getByRole('button', { name: /log event/i }));

    const events = await db.events.where('entity_id').equals('a6').toArray();
    expect(events).toHaveLength(1);
    expect(events[0].amount).toBe(25.5);
  });

  it('offers only expense/sale/death for a batch, defaulting to expense', async () => {
    render(<EventForm entityType="batch" entityId="b1" />);

    const select = screen.getByLabelText(/event/i) as HTMLSelectElement;
    expect(select).toHaveValue('expense');
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual(['expense', 'sale', 'death']);
  });

  it('shows a headcount field for a batch sale, defaulted to 1, and stores it as metadata.quantity', async () => {
    const user = userEvent.setup();
    render(<EventForm entityType="batch" entityId="b2" />);

    await user.selectOptions(screen.getByLabelText(/event/i), 'sale');
    const countInput = screen.getByLabelText(/number of pigs/i);
    expect(countInput).toHaveValue(1);

    await user.clear(countInput);
    await user.type(countInput, '3');
    await user.type(screen.getByLabelText(/amount/i), '600');
    await user.click(screen.getByRole('button', { name: /log event/i }));

    const events = await db.events.where('entity_id').equals('b2').toArray();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ amount: 600 });
    expect(events[0].metadata).toMatchObject({ quantity: 3 });
  });

  it('does not show a headcount field for a batch expense', async () => {
    render(<EventForm entityType="batch" entityId="b3" />);

    expect(screen.queryByLabelText(/number of pigs/i)).not.toBeInTheDocument();
  });

  it('resets the headcount field back to 1 after a successful batch sale submit', async () => {
    const user = userEvent.setup();
    render(<EventForm entityType="batch" entityId="b4" />);

    await user.selectOptions(screen.getByLabelText(/event/i), 'sale');
    const countInput = screen.getByLabelText(/number of pigs/i) as HTMLInputElement;
    await user.clear(countInput);
    await user.type(countInput, '4');
    expect(countInput).toHaveValue(4);

    await user.type(screen.getByLabelText(/amount/i), '800');
    await user.click(screen.getByRole('button', { name: /log event/i }));

    await waitFor(async () => {
      const events = await db.events.where('entity_id').equals('b4').toArray();
      expect(events).toHaveLength(1);
    });

    await waitFor(() => {
      expect(countInput).toHaveValue(1);
    });
  });

  it('labels the amount field "Total amount" for a batch sale, but plain "Amount" otherwise', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<EventForm entityType="batch" entityId="b5" />);

    await user.selectOptions(screen.getByLabelText(/event/i), 'sale');
    expect(screen.getByText('Total amount')).toBeInTheDocument();
    expect(screen.queryByText('Amount', { selector: 'label' })).not.toBeInTheDocument();

    rerender(<EventForm entityType="animal" entityId="a7" />);
    await user.selectOptions(screen.getByLabelText(/event/i), 'expense');
    expect(screen.getByText('Amount', { selector: 'label' })).toBeInTheDocument();
    expect(screen.queryByText('Total amount')).not.toBeInTheDocument();
  });
});
