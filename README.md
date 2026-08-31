# Bassy Farms

Offline-first farm record-keeping PWA. See `farm-prd.md` and
`docs/superpowers/specs/2026-08-31-farm-v1-design.md` for product/design context.

## Setup

1. Create a Supabase project.
2. In the Supabase SQL editor, run `supabase/migrations/0001_init.sql`.
3. In Supabase Auth, create one user (email + password) — this is the app's single account.
4. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   (Project Settings → API in the Supabase dashboard).
5. Install and run:

```bash
npm install
npm run dev
```

PWA icons (`public/icon-192.png`, `public/icon-512.png`) are already checked in as solid
`#2f5233` dark-green placeholders — swap them for real branded artwork whenever you have it;
nothing else needs to change to pick up new icons.

### Local dev on a physical device

If you want to test the PWA on a phone over your LAN, plain `http://<lan-ip>:port` won't be
enough: offline-generated record IDs use `crypto.randomUUID()`, which browsers only expose in a
secure context (HTTPS, or `localhost`). Either tunnel your dev server over HTTPS (e.g. ngrok,
Cloudflare Tunnel, or `vite --host` behind a reverse proxy with TLS) or access it via `localhost`
(e.g. port-forwarding over USB/adb for Android).

## Testing

```bash
npm run test
```

This runs the Vitest suite. To check TypeScript correctness, use:

```bash
npx tsc -b --noEmit
```

**Not** bare `npx tsc --noEmit` — because of this project's root `tsconfig.json`
project-references setup, that command silently type-checks zero files and will report success
even when there are real errors. The most reliable single command to verify both type
correctness and that the app actually builds is:

```bash
npm run build
```

(runs `tsc -b && vite build`).

## Deployment

Deploy to Vercel: connect this repo, set the same two `VITE_SUPABASE_*` env vars
in the Vercel project settings, and deploy. No backend service to configure —
the app talks to Supabase directly.

## What's built (v1 foundation)

- Auth (Supabase, single account), with immediate sync-on-login rather than waiting on
  background polling
- Offline-first local storage (Dexie/IndexedDB, versioned schema) with background sync to
  Supabase — push + pull, reentrancy-guarded, retry-on-next-tick
- PWA installability (manifest + service worker, real icons)
- Animals: list with an add-animal form, detail view with event timeline, and a generic
  event-logging form reusable for future entity types
- Unsynced-changes indicator (`src/components/UnsyncedIndicator.tsx`), shown in the app shell
  while authenticated, polling `unsyncedCount()` and displaying "N unsynced changes" whenever
  there's something waiting to sync
- `AnimalDetail` distinguishes "still loading" from "no such animal", showing a clear
  not-found message for a stale/bad `:id` instead of "Loading…" forever

## Not yet built

- Plots (same pattern as Animals, not yet wired up). Note: `EventForm`'s event-type list is
  currently Animals-specific and will need to become entity-aware before Plots can reuse it.
- Quick-log home screen shortcut
- Reports / profitability dashboard (V2)
