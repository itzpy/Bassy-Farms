# Farm V1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the full technical foundation for the farm app — project scaffold, Supabase schema/RLS, local-first Dexie storage, the offline sync engine, auth, PWA config, and a complete Animals vertical slice (list, detail, event timeline, add-event) as the pattern the rest of the app follows.

**Architecture:** React + TypeScript PWA (Vite) with Dexie/IndexedDB as the local source of truth, syncing directly to Supabase Postgres (no custom backend), per `docs/superpowers/specs/2026-08-31-farm-v1-design.md`.

**Tech Stack:** Vite, React, TypeScript, Dexie.js, `@supabase/supabase-js`, react-router-dom, vite-plugin-pwa, Vitest, React Testing Library, fake-indexeddb.

**Follow-up plan (not in this plan):** Plots vertical slice, Quick-log home screen entry point, Reports/profitability views (V2). These reuse the events/sync foundation built here.

---

## File structure this plan produces

```
package.json
vite.config.ts
tsconfig.json
.env.example
index.html
src/
  main.tsx
  App.tsx
  routes.tsx
  test/setup.ts
  lib/
    types.ts
    supabase.ts
    db.ts
    sync.ts
    sync.test.ts
  auth/
    AuthContext.tsx
    SignIn.tsx
    ProtectedRoute.tsx
  features/
    animals/
      api.ts
      api.test.ts
      AnimalsList.tsx
      AnimalsList.test.tsx
      AnimalForm.tsx
      AnimalDetail.tsx
    events/
      api.ts
      api.test.ts
      EventForm.tsx
supabase/
  migrations/
    0001_init.sql
README.md
```

---

### Task 1: Scaffold the Vite project

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `.gitignore`

- [ ] **Step 1: Scaffold with Vite's React-TS template**

Run:
```bash
npm create vite@latest . -- --template react-ts
```
Expected: files created in the current directory (`package.json`, `src/`, `index.html`, etc.). Answer "yes" if prompted about a non-empty directory (only `farm-prd.md` and `docs/` exist).

- [ ] **Step 2: Install runtime dependencies**

Run:
```bash
npm install @supabase/supabase-js dexie dexie-react-hooks react-router-dom
```
Expected: exits 0, `package.json` `dependencies` includes all four packages.

- [ ] **Step 3: Install dev/test dependencies**

Run:
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom fake-indexeddb vite-plugin-pwa
```
Expected: exits 0, `package.json` `devDependencies` includes all six packages.

- [ ] **Step 4: Add test script to `package.json`**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Verify the scaffold builds**

Run: `npm run build`
Expected: exits 0, `dist/` created.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite React TypeScript project"
```

---

### Task 2: Configure Vitest with jsdom + fake-indexeddb

**Files:**
- Create: `src/test/setup.ts`
- Modify: `vite.config.ts`

- [ ] **Step 1: Write the test setup file**

`src/test/setup.ts`:
```ts
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 2: Configure Vitest in `vite.config.ts`**

Replace the contents of `vite.config.ts` with:
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
});
```

- [ ] **Step 3: Write a trivial sanity test**

Create `src/test/sanity.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('test setup', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Run the test suite**

Run: `npm run test`
Expected: PASS, 1 test passed.

- [ ] **Step 5: Delete the sanity test and commit**

```bash
rm src/test/sanity.test.ts
git add -A
git commit -m "chore: configure vitest with jsdom and fake-indexeddb"
```

---

### Task 3: Shared TypeScript types

**Files:**
- Create: `src/lib/types.ts`

- [ ] **Step 1: Write the domain types**

`src/lib/types.ts`:
```ts
export type AnimalType = 'pig' | 'goat';
export type AnimalStatus = 'active' | 'sold' | 'deceased';

export interface Animal {
  id: string;
  type: AnimalType;
  tag: string;
  birth_date: string | null;
  status: AnimalStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Plot {
  id: string;
  name: string;
  crop_type: string | null;
  planted_date: string | null;
  area: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type EventType =
  | 'feeding'
  | 'vaccination'
  | 'weight'
  | 'health_check'
  | 'breeding'
  | 'death'
  | 'planting'
  | 'harvest'
  | 'expense'
  | 'sale';

export type EntityType = 'animal' | 'plot' | 'farm';

export interface FarmEvent {
  id: string;
  client_id: string;
  event_type: EventType;
  entity_type: EntityType;
  entity_id: string | null;
  event_date: string;
  amount: number | null;
  category: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add shared domain types"
```

---

### Task 4: Supabase schema, RLS, and client

**Files:**
- Create: `supabase/migrations/0001_init.sql`, `src/lib/supabase.ts`, `.env.example`

- [ ] **Step 1: Write the schema migration**

`supabase/migrations/0001_init.sql`:
```sql
create table animals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  type text not null check (type in ('pig','goat')),
  tag text not null,
  birth_date date,
  status text not null default 'active' check (status in ('active','sold','deceased')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table plots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  name text not null,
  crop_type text,
  planted_date date,
  area numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  client_id uuid not null unique,
  event_type text not null check (event_type in (
    'feeding','vaccination','weight','health_check','breeding','death',
    'planting','harvest','expense','sale'
  )),
  entity_type text not null check (entity_type in ('animal','plot','farm')),
  entity_id uuid,
  event_date date not null,
  amount numeric,
  category text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table animals enable row level security;
alter table plots enable row level security;
alter table events enable row level security;

create policy "animals_owner" on animals
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "plots_owner" on plots
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "events_owner" on events
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

- [ ] **Step 2: Write the env template**

`.env.example`:
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Add `.env` (not `.env.example`) to `.gitignore` if it isn't already there.

- [ ] **Step 3: Write the Supabase client**

`src/lib/supabase.ts`:
```ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: exits 0. (This will not fail even without a real `.env` — `import.meta.env` typing resolves fine; the runtime throw only fires when the app actually starts without env vars set.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0001_init.sql .env.example src/lib/supabase.ts .gitignore
git commit -m "feat: add Supabase schema migration, RLS policies, and client"
```

**Note for the human running this plan:** apply `0001_init.sql` via the Supabase SQL editor (or `supabase db push` if using the CLI) against your Supabase project, and create one user (yourself) via Supabase Auth before Task 9's sign-in screen is usable end-to-end.

---

### Task 5: Dexie local database schema

**Files:**
- Create: `src/lib/db.ts`

- [ ] **Step 1: Write the Dexie schema**

`src/lib/db.ts`:
```ts
import Dexie, { type Table } from 'dexie';
import type { Animal, Plot, FarmEvent } from './types';

export interface LocalAnimal extends Animal {
  synced: 0 | 1;
}
export interface LocalPlot extends Plot {
  synced: 0 | 1;
}
export interface LocalEvent extends FarmEvent {
  synced: 0 | 1;
}

export class FarmDB extends Dexie {
  animals!: Table<LocalAnimal, string>;
  plots!: Table<LocalPlot, string>;
  events!: Table<LocalEvent, string>;

  constructor() {
    super('farm-db');
    this.version(1).stores({
      animals: 'id, type, status, synced, updated_at',
      plots: 'id, synced, updated_at',
      events: 'id, client_id, entity_type, entity_id, event_type, event_date, synced, updated_at',
    });
  }
}

export const db = new FarmDB();
```

**Why `synced: 0 | 1` and not `boolean`:** IndexedDB (and therefore Dexie) cannot index a `boolean` key — indexed columns must be number, string, date, or array. Using `0`/`1` keeps the `synced` column queryable (`db.animals.where('synced').equals(0)`).

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add Dexie local database schema"
```

---

### Task 6: Sync engine — push

**Files:**
- Create: `src/lib/sync.ts`, `src/lib/sync.test.ts`

- [ ] **Step 1: Write the failing test for `pushTable`**

`src/lib/sync.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from './db';

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from './supabase';
import { pushTable } from './sync';

describe('pushTable', () => {
  beforeEach(async () => {
    await db.animals.clear();
  });

  it('upserts unsynced records and marks them synced on success', async () => {
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

    const upsert = vi.fn().mockResolvedValue({ error: null });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ upsert });

    await pushTable('animals');

    expect(supabase.from).toHaveBeenCalledWith('animals');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a1', tag: 'P-01' }),
      { onConflict: 'id' }
    );
    const stored = await db.animals.get('a1');
    expect(stored?.synced).toBe(1);
  });

  it('leaves a record unsynced if the upsert fails', async () => {
    await db.animals.put({
      id: 'a2',
      type: 'goat',
      tag: 'G-01',
      birth_date: null,
      status: 'active',
      notes: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      synced: 0,
    });

    const upsert = vi.fn().mockResolvedValue({ error: { message: 'network error' } });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ upsert });

    await pushTable('animals');

    const stored = await db.animals.get('a2');
    expect(stored?.synced).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- sync.test.ts`
Expected: FAIL — `pushTable` is not exported from `./sync` (file doesn't exist yet).

- [ ] **Step 3: Implement `pushTable`**

`src/lib/sync.ts`:
```ts
import { db } from './db';
import { supabase } from './supabase';

export const SYNC_TABLES = ['animals', 'plots', 'events'] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

function localTable(table: SyncTable) {
  return db[table];
}

export async function pushTable(table: SyncTable): Promise<void> {
  const unsynced = await localTable(table).where('synced').equals(0).toArray();

  for (const record of unsynced) {
    const { synced, ...remoteRecord } = record;
    const { error } = await supabase.from(table).upsert(remoteRecord, { onConflict: 'id' });
    if (!error) {
      await localTable(table).update(record.id, { synced: 1 });
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- sync.test.ts`
Expected: PASS, 2 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync.ts src/lib/sync.test.ts
git commit -m "feat: add sync engine push logic"
```

---

### Task 7: Sync engine — pull

**Files:**
- Modify: `src/lib/sync.ts`, `src/lib/sync.test.ts`

- [ ] **Step 1: Write the failing test for `pullTable`**

Append to `src/lib/sync.test.ts`:
```ts
import { pullTable, resetSyncCursors } from './sync';

describe('pullTable', () => {
  beforeEach(async () => {
    await db.animals.clear();
    resetSyncCursors();
  });

  it('upserts remote records into the local table as synced', async () => {
    const gt = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'a3',
          type: 'pig',
          tag: 'P-03',
          birth_date: null,
          status: 'active',
          notes: null,
          created_at: '2026-02-01T00:00:00.000Z',
          updated_at: '2026-02-01T00:00:00.000Z',
        },
      ],
      error: null,
    });
    const select = vi.fn().mockReturnValue({ gt });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ select });

    await pullTable('animals');

    const stored = await db.animals.get('a3');
    expect(stored).toMatchObject({ id: 'a3', tag: 'P-03', synced: 1 });
  });
});
```

Add the `import { supabase } from './supabase';` mock block from Task 6 if not already present at the top of the file (it is — both `describe` blocks share the same file and mock).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- sync.test.ts`
Expected: FAIL — `pullTable` and `resetSyncCursors` are not exported.

- [ ] **Step 3: Implement `pullTable`**

Add to `src/lib/sync.ts`:
```ts
const EPOCH = new Date(0).toISOString();

let lastPullAt: Record<SyncTable, string> = {
  animals: EPOCH,
  plots: EPOCH,
  events: EPOCH,
};

export function resetSyncCursors(): void {
  lastPullAt = { animals: EPOCH, plots: EPOCH, events: EPOCH };
}

export async function pullTable(table: SyncTable): Promise<void> {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .gt('updated_at', lastPullAt[table]);

  if (error || !data) return;

  for (const remote of data as Array<Record<string, unknown> & { id: string; updated_at: string }>) {
    await localTable(table).put({ ...remote, synced: 1 } as never);
    if (remote.updated_at > lastPullAt[table]) {
      lastPullAt[table] = remote.updated_at;
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- sync.test.ts`
Expected: PASS, 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync.ts src/lib/sync.test.ts
git commit -m "feat: add sync engine pull logic"
```

---

### Task 8: Sync orchestration — syncAll, startSyncLoop, unsyncedCount

**Files:**
- Modify: `src/lib/sync.ts`, `src/lib/sync.test.ts`

- [ ] **Step 1: Write the failing test for `unsyncedCount`**

Append to `src/lib/sync.test.ts`:
```ts
import { unsyncedCount } from './sync';

describe('unsyncedCount', () => {
  beforeEach(async () => {
    await db.animals.clear();
    await db.plots.clear();
    await db.events.clear();
  });

  it('sums unsynced records across all tables', async () => {
    await db.animals.put({
      id: 'a4', type: 'pig', tag: 'P-04', birth_date: null, status: 'active',
      notes: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });
    await db.events.put({
      id: 'e1', client_id: 'e1', event_type: 'feeding', entity_type: 'animal', entity_id: 'a4',
      event_date: '2026-01-01', amount: null, category: null, notes: null, metadata: {},
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });

    const count = await unsyncedCount();
    expect(count).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- sync.test.ts`
Expected: FAIL — `unsyncedCount` is not exported.

- [ ] **Step 3: Implement `syncAll`, `startSyncLoop`, `unsyncedCount`**

Add to `src/lib/sync.ts`:
```ts
export async function syncAll(): Promise<void> {
  for (const table of SYNC_TABLES) {
    await pushTable(table);
    await pullTable(table);
  }
}

export function startSyncLoop(intervalMs = 60_000): () => void {
  const trigger = () => {
    void syncAll();
  };
  trigger();
  window.addEventListener('online', trigger);
  const interval = window.setInterval(trigger, intervalMs);
  return () => {
    window.removeEventListener('online', trigger);
    window.clearInterval(interval);
  };
}

export async function unsyncedCount(): Promise<number> {
  const counts = await Promise.all(
    SYNC_TABLES.map((table) => localTable(table).where('synced').equals(0).count())
  );
  return counts.reduce((sum, n) => sum + n, 0);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- sync.test.ts`
Expected: PASS, 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync.ts src/lib/sync.test.ts
git commit -m "feat: add sync orchestration (syncAll, startSyncLoop, unsyncedCount)"
```

---

### Task 9: Auth — context, sign-in screen, protected route

**Files:**
- Create: `src/auth/AuthContext.tsx`, `src/auth/SignIn.tsx`, `src/auth/ProtectedRoute.tsx`

- [ ] **Step 1: Write the auth context**

`src/auth/AuthContext.tsx`:
```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
```

- [ ] **Step 2: Write the sign-in screen**

`src/auth/SignIn.tsx`:
```tsx
import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

export function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) setError(signInError.message);
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Sign in</h1>
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit">Sign in</button>
    </form>
  );
}
```

- [ ] **Step 3: Write the protected route wrapper**

`src/auth/ProtectedRoute.tsx`:
```tsx
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { SignIn } from './SignIn';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) return <p>Loading…</p>;
  if (!session) return <SignIn />;
  return <>{children}</>;
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/auth
git commit -m "feat: add Supabase auth context, sign-in screen, and protected route"
```

---

### Task 10: PWA configuration

**Files:**
- Modify: `vite.config.ts`
- Create: `public/icon-192.png`, `public/icon-512.png` (placeholders — see note)

- [ ] **Step 1: Add `vite-plugin-pwa` to the Vite config**

Update `vite.config.ts`:
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Bassy Farms',
        short_name: 'Bassy Farms',
        description: 'Offline-first farm record-keeping',
        theme_color: '#2f5233',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
});
```

- [ ] **Step 2: Add placeholder app icons**

The engineer running this plan must drop two real PNG files at `public/icon-192.png` (192×192) and `public/icon-512.png` (512×512) before deploying — a simple solid-color square with "BF" text is enough for v1. This step cannot be scripted here; note it and move on. Without these files the dev server still runs fine; only the installability manifest is incomplete.

- [ ] **Step 3: Verify the app builds with the PWA plugin**

Run: `npm run build`
Expected: exits 0, `dist/manifest.webmanifest` and `dist/sw.js` are generated.

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts public
git commit -m "feat: add PWA manifest and service worker config"
```

---

### Task 11: App shell, routing, sync loop wiring

**Files:**
- Modify: `src/main.tsx`, `src/App.tsx`
- Create: `src/routes.tsx`

- [ ] **Step 1: Write the route table**

`src/routes.tsx` (Plots/Reports routes are added by the follow-up plan; only Animals routes exist now):
```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { AnimalsList } from './features/animals/AnimalsList';
import { AnimalDetail } from './features/animals/AnimalDetail';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/animals" replace />} />
      <Route path="/animals" element={<AnimalsList />} />
      <Route path="/animals/:id" element={<AnimalDetail />} />
    </Routes>
  );
}
```

- [ ] **Step 2: Wire up `App.tsx`**

`src/App.tsx`:
```tsx
import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppRoutes } from './routes';
import { startSyncLoop } from './lib/sync';

export default function App() {
  useEffect(() => {
    const stop = startSyncLoop();
    return stop;
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <ProtectedRoute>
          <AppRoutes />
        </ProtectedRoute>
      </BrowserRouter>
    </AuthProvider>
  );
}
```

- [ ] **Step 3: Simplify `main.tsx`**

`src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

Delete `src/App.css` and `src/index.css`'s Vite-template boilerplate content if present, leaving an empty (or minimal) stylesheet — styling is out of scope for this plan.

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc -b --noEmit` (NOT bare `npx tsc --noEmit` — the root `tsconfig.json` uses project references with `"files": []`, so the bare command silently checks zero files. `-b` actually type-checks the project. See Task 10's discovery of this.)
Expected: exits 0. (Task 13/14 create the `AnimalsList`/`AnimalDetail` components this file imports — if running tasks strictly in order, this step will fail until those exist. Run it again after Task 14, or skip the check here and rely on Task 14's compile check.)

- [ ] **Step 5: Commit**

```bash
git add src/main.tsx src/App.tsx src/routes.tsx
git commit -m "feat: wire up app shell, routing, and sync loop"
```

---

### Task 12: Animals data layer

**Files:**
- Create: `src/features/animals/api.ts`, `src/features/animals/api.test.ts`

- [ ] **Step 1: Write the failing test**

`src/features/animals/api.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../lib/db';
import { createAnimal, updateAnimalStatus } from './api';

describe('animals api', () => {
  beforeEach(async () => {
    await db.animals.clear();
  });

  it('createAnimal stores a new unsynced active animal', async () => {
    const id = await createAnimal({ type: 'pig', tag: 'P-01', birth_date: null, notes: null });
    const stored = await db.animals.get(id);
    expect(stored).toMatchObject({ type: 'pig', tag: 'P-01', status: 'active', synced: 0 });
  });

  it('updateAnimalStatus updates status and marks unsynced', async () => {
    const id = await createAnimal({ type: 'goat', tag: 'G-01', birth_date: null, notes: null });
    await db.animals.update(id, { synced: 1 });

    await updateAnimalStatus(id, 'sold');

    const stored = await db.animals.get(id);
    expect(stored).toMatchObject({ status: 'sold', synced: 0 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- features/animals/api.test.ts`
Expected: FAIL — `./api` module doesn't exist.

- [ ] **Step 3: Implement the API**

`src/features/animals/api.ts`:
```ts
import { db } from '../../lib/db';
import type { AnimalType, AnimalStatus } from '../../lib/types';

export interface NewAnimalInput {
  type: AnimalType;
  tag: string;
  birth_date: string | null;
  notes: string | null;
}

export async function createAnimal(input: NewAnimalInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.animals.put({
    id,
    type: input.type,
    tag: input.tag,
    birth_date: input.birth_date,
    status: 'active',
    notes: input.notes,
    created_at: now,
    updated_at: now,
    synced: 0,
  });
  return id;
}

export async function updateAnimalStatus(id: string, status: AnimalStatus): Promise<void> {
  await db.animals.update(id, { status, updated_at: new Date().toISOString(), synced: 0 });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- features/animals/api.test.ts`
Expected: PASS, 2 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/features/animals/api.ts src/features/animals/api.test.ts
git commit -m "feat: add animals data layer"
```

---

### Task 13: Animals list screen with add-animal form

**Files:**
- Create: `src/features/animals/AnimalsList.tsx`, `src/features/animals/AnimalForm.tsx`, `src/features/animals/AnimalsList.test.tsx`

- [ ] **Step 1: Write the failing component test**

`src/features/animals/AnimalsList.test.tsx`:
```tsx
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- features/animals/AnimalsList.test.tsx`
Expected: FAIL — `./AnimalsList` doesn't exist.

- [ ] **Step 3: Write the add-animal form**

`src/features/animals/AnimalForm.tsx`:
```tsx
import { useState, type FormEvent } from 'react';
import type { AnimalType } from '../../lib/types';
import { createAnimal } from './api';

export function AnimalForm({ onCreated }: { onCreated?: (id: string) => void }) {
  const [type, setType] = useState<AnimalType>('pig');
  const [tag, setTag] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!tag.trim()) return;
    const id = await createAnimal({ type, tag: tag.trim(), birth_date: null, notes: null });
    setTag('');
    onCreated?.(id);
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="animal-type">Type</label>
      <select id="animal-type" value={type} onChange={(e) => setType(e.target.value as AnimalType)}>
        <option value="pig">Pig</option>
        <option value="goat">Goat</option>
      </select>

      <label htmlFor="animal-tag">Tag</label>
      <input id="animal-tag" value={tag} onChange={(e) => setTag(e.target.value)} />

      <button type="submit">Add animal</button>
    </form>
  );
}
```

- [ ] **Step 4: Write the list screen**

`src/features/animals/AnimalsList.tsx`:
```tsx
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { AnimalForm } from './AnimalForm';

export function AnimalsList() {
  const animals = useLiveQuery(() => db.animals.orderBy('tag').toArray(), []);

  return (
    <div>
      <h1>Animals</h1>
      <AnimalForm />
      <ul>
        {(animals ?? []).map((animal) => (
          <li key={animal.id}>
            <Link to={`/animals/${animal.id}`}>{animal.tag}</Link> — {animal.type} ({animal.status})
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -- features/animals/AnimalsList.test.tsx`
Expected: PASS, 1 test passed.

- [ ] **Step 6: Commit**

```bash
git add src/features/animals/AnimalsList.tsx src/features/animals/AnimalForm.tsx src/features/animals/AnimalsList.test.tsx
git commit -m "feat: add animals list screen with add-animal form"
```

---

### Task 14: Events data layer, event form, animal detail screen

**Files:**
- Create: `src/features/events/api.ts`, `src/features/events/api.test.ts`, `src/features/events/EventForm.tsx`, `src/features/animals/AnimalDetail.tsx`

- [ ] **Step 1: Write the failing test for the events API**

`src/features/events/api.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../lib/db';
import { createEvent } from './api';

describe('events api', () => {
  beforeEach(async () => {
    await db.events.clear();
  });

  it('createEvent stores an unsynced event with matching client_id and id', async () => {
    const id = await createEvent({
      event_type: 'feeding',
      entity_type: 'animal',
      entity_id: 'a1',
      event_date: '2026-08-31',
      amount: null,
      category: null,
      notes: 'Morning feed',
      metadata: {},
    });

    const stored = await db.events.get(id);
    expect(stored).toMatchObject({
      id,
      client_id: id,
      event_type: 'feeding',
      entity_id: 'a1',
      synced: 0,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- features/events/api.test.ts`
Expected: FAIL — `./api` doesn't exist.

- [ ] **Step 3: Implement the events API**

`src/features/events/api.ts`:
```ts
import { db } from '../../lib/db';
import type { EventType, EntityType } from '../../lib/types';

export interface NewEventInput {
  event_type: EventType;
  entity_type: EntityType;
  entity_id: string | null;
  event_date: string;
  amount: number | null;
  category: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
}

export async function createEvent(input: NewEventInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.events.put({
    id,
    client_id: id,
    event_type: input.event_type,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    event_date: input.event_date,
    amount: input.amount,
    category: input.category,
    notes: input.notes,
    metadata: input.metadata,
    created_at: now,
    updated_at: now,
    synced: 0,
  });
  return id;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- features/events/api.test.ts`
Expected: PASS, 1 test passed.

- [ ] **Step 5: Write the generic event form**

`src/features/events/EventForm.tsx` (reusable for animals now, plots in the follow-up plan):
```tsx
import { useState, type FormEvent } from 'react';
import type { EntityType, EventType } from '../../lib/types';
import { createEvent } from './api';

const ANIMAL_EVENT_TYPES: EventType[] = [
  'feeding', 'vaccination', 'weight', 'health_check', 'breeding', 'death', 'expense', 'sale',
];

export function EventForm({
  entityType,
  entityId,
  onCreated,
}: {
  entityType: EntityType;
  entityId: string;
  onCreated?: () => void;
}) {
  const [eventType, setEventType] = useState<EventType>('feeding');
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await createEvent({
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
      event_date: eventDate,
      amount: null,
      category: null,
      notes: notes.trim() || null,
      metadata: {},
    });
    setNotes('');
    onCreated?.();
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="event-type">Event</label>
      <select id="event-type" value={eventType} onChange={(e) => setEventType(e.target.value as EventType)}>
        {ANIMAL_EVENT_TYPES.map((type) => (
          <option key={type} value={type}>{type}</option>
        ))}
      </select>

      <label htmlFor="event-date">Date</label>
      <input id="event-date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />

      <label htmlFor="event-notes">Notes</label>
      <input id="event-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />

      <button type="submit">Log event</button>
    </form>
  );
}
```

- [ ] **Step 6: Write the animal detail screen**

`src/features/animals/AnimalDetail.tsx`:
```tsx
import { useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { EventForm } from '../events/EventForm';

export function AnimalDetail() {
  const { id } = useParams<{ id: string }>();

  const animal = useLiveQuery(() => (id ? db.animals.get(id) : undefined), [id]);
  const events = useLiveQuery(
    () =>
      id
        ? db.events
            .where('entity_id')
            .equals(id)
            .and((e) => e.entity_type === 'animal')
            .reverse()
            .sortBy('event_date')
        : [],
    [id]
  );

  if (!animal) return <p>Loading…</p>;

  return (
    <div>
      <h1>{animal.tag} ({animal.type})</h1>
      <p>Status: {animal.status}</p>

      <h2>Log an event</h2>
      <EventForm entityType="animal" entityId={animal.id} />

      <h2>History</h2>
      <ul>
        {(events ?? []).map((event) => (
          <li key={event.id}>
            {event.event_date} — {event.event_type} {event.notes ? `— ${event.notes}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 7: Verify the whole app compiles**

Run: `npx tsc -b --noEmit` (real project-references check — see Task 10's note; bare `npx tsc --noEmit` checks nothing here)
Expected: exits 0 (this also resolves Task 11 Step 4's deferred check, since `AnimalsList` and `AnimalDetail` now exist).

- [ ] **Step 8: Run the full test suite**

Run: `npm run test`
Expected: PASS, all tests passed (sync: 4, animals api: 2, animals list: 1, events api: 1 = 8 tests).

- [ ] **Step 9: Commit**

```bash
git add src/features/events src/features/animals/AnimalDetail.tsx
git commit -m "feat: add events data layer, event form, and animal detail screen"
```

---

### Task 15: README with setup instructions

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write setup instructions**

`README.md`:
```markdown
# Bassy Farms

Offline-first farm record-keeping PWA. See `farm-prd.md` and
`docs/superpowers/specs/2026-08-31-farm-v1-design.md` for product/design context.

## Setup

1. Create a Supabase project.
2. In the Supabase SQL editor, run `supabase/migrations/0001_init.sql`.
3. In Supabase Auth, create one user (email + password) — this is the app's single account.
4. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   (Project Settings → API in the Supabase dashboard).
5. Add `public/icon-192.png` and `public/icon-512.png` (any square PNGs) for PWA installability.
6. Install and run:

\`\`\`bash
npm install
npm run dev
\`\`\`

## Testing

\`\`\`bash
npm run test
\`\`\`

## Deployment

Deploy to Vercel: connect this repo, set the same two `VITE_SUPABASE_*` env vars
in the Vercel project settings, and deploy. No backend service to configure —
the app talks to Supabase directly.

## What's built (v1 foundation)

- Auth (Supabase, single account)
- Offline-first local storage (Dexie/IndexedDB) with background sync to Supabase
- Animals: list, add, detail view, event timeline, log-event form

## Not yet built

- Plots (same pattern as Animals, not yet wired up)
- Quick-log home screen shortcut
- Reports / profitability dashboard (V2)
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup instructions"
```

---

## Plan self-review notes

- **Spec coverage:** Architecture (§1) → Tasks 1,4,9,10. Data model (§2) → Tasks 3,4,5. Sync (§3) → Tasks 6,7,8. Frontend structure (§4) → Tasks 9,11,13,14 for the Animals slice; Plots/Quick-log/Reports explicitly deferred to the follow-up plan named in the header. Error handling/testing (§5) → sync errors handled in Task 6 (failed push leaves `synced: 0`), local-write failures are not separately caught because `db.put`/`db.update` already reject and propagate — no code masks them.
- **Type consistency:** `synced` is `0 | 1` everywhere (Tasks 5–14); `entity_id`/`entity_type` names match between `types.ts`, `db.ts`, `sync.ts` test fixtures, and `events/api.ts`. `SyncTable` union (`'animals' | 'plots' | 'events'`) matches `db.ts` table names throughout.
- **No placeholders:** all code blocks are complete; the one deliberately manual step (Task 10 Step 2, app icons) is called out as non-scriptable rather than left as a vague TODO.
