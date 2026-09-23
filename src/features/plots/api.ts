import { db } from '../../lib/db';

export interface NewPlotInput {
  name: string;
  crop_type: string | null;
  planted_date: string | null;
  area: number | null;
  notes: string | null;
}

export async function createPlot(input: NewPlotInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.plots.put({
    id,
    name: input.name,
    crop_type: input.crop_type,
    planted_date: input.planted_date,
    area: input.area,
    notes: input.notes,
    created_at: now,
    updated_at: now,
    synced: 0,
  });
  return id;
}

export async function updatePlot(id: string, patch: Partial<NewPlotInput>): Promise<void> {
  await db.plots.update(id, { ...patch, updated_at: new Date().toISOString(), synced: 0 });
}

export async function deletePlot(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.plots.update(id, { deleted_at: now, updated_at: now, synced: 0 });
}
