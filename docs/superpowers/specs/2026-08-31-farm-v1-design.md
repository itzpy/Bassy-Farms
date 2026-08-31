# Design: Farm Management App — V1 (Core Logging)

**Status:** Approved
**Date:** 2026-08-31
**Source PRD:** `farm-prd.md`

## Scope

This spec covers PRD milestone V1 (core logging): livestock/plot CRUD, event
logging, offline-first storage, sync to Supabase, and single-user auth. It
supersedes the PRD's proposed Fastify backend layer — see Architecture below
for why.

## 1. Overall architecture

Frontend-only PWA talking directly to Supabase — no custom backend server.

- **Frontend:** React + TypeScript PWA (Vite + `vite-plugin-pwa`), deployed
  on Vercel (free tier)
- **Local storage:** IndexedDB via Dexie.js — the local source of truth for
  all reads/writes while offline
- **Remote storage:** Supabase Postgres, accessed directly from the browser
  via `@supabase/supabase-js`
- **Auth:** Supabase Auth, single email/password account (the farm owner),
  Row Level Security scoping every table to that one `user_id`
- **Sync:** App writes to Dexie immediately (always succeeds, even offline);
  a sync engine pushes/pulls to Supabase whenever the app is online (on
  load, on reconnect, and periodically while open) — no reliance on the
  Background Sync API, since iOS Safari (the target device) doesn't support
  it

This drops the Fastify API layer from the original PRD proposal. Supabase +
RLS covers the "single shared credential" and durability requirements
without a service that would need to be hosted, deployed, and kept alive
separately — better fit for the "maintainable by one developer" NFR.

**Target device:** iPhone (Safari) in the field, laptop (any modern browser)
at day's end. Design assumes iOS Safari's PWA constraints (no Background
Sync, possible IndexedDB eviction after ~7 days of inactivity) as the
lowest common denominator.

## 2. Data model

One generic `events` table underpins livestock, crop, and financial
records, plus two registry tables for the things events attach to.

### `animals`
| column | type | notes |
|---|---|---|
| id | uuid | pk |
| type | text | `pig` \| `goat` |
| tag | text | identifier |
| birth_date | date | nullable |
| status | text | `active` \| `sold` \| `deceased` |
| notes | text | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `plots`
| column | type | notes |
|---|---|---|
| id | uuid | pk |
| name | text | |
| crop_type | text | |
| planted_date | date | nullable |
| area | numeric | nullable |
| notes | text | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `events`
| column | type | notes |
|---|---|---|
| id | uuid | pk |
| event_type | text | `feeding` \| `vaccination` \| `weight` \| `health_check` \| `breeding` \| `death` \| `planting` \| `harvest` \| `expense` \| `sale` |
| entity_type | text | `animal` \| `plot` \| `farm` |
| entity_id | uuid | nullable — null when `entity_type = farm` |
| event_date | date | |
| amount | numeric | nullable — used by `expense`/`sale` |
| category | text | nullable — e.g. `feed`, `vet` |
| notes | text | nullable |
| metadata | jsonb | event-type-specific extras, e.g. `{weight_kg: 45}`, `{vaccine: "CDT"}` |
| client_id | uuid | generated on-device at creation; used for sync de-dupe |
| synced | boolean | local-only flag (Dexie), not persisted to Supabase |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Rationale:**
- `animals`/`plots` are lightweight registries so the UI gets dropdowns and
  identity (tag, status) without duplicating that data into every event.
- `metadata` (jsonb) absorbs event-type-specific fields without needing a
  new column or migration every time a new kind of detail needs logging.
- `amount`/`category` are real columns, not buried in jsonb, because
  profitability reporting needs to aggregate/filter on them efficiently.
- `client_id` is generated offline at creation time so the sync engine can
  distinguish "new event" from "resync of one Supabase already has" under
  last-write-wins conflict resolution.

### Row Level Security

All three tables carry a `user_id` column (not shown above, implicit)
defaulting to `auth.uid()`, with RLS policies restricting all operations to
rows where `user_id = auth.uid()`.

## 3. Offline & sync strategy

- **Writes:** Every create/edit goes to Dexie (IndexedDB) first and
  immediately reflects in the UI — satisfies "logging an event must never
  fail due to lack of connectivity." Each local record carries a `synced:
  boolean` flag.
- **Sync triggers:** On app load, on `window.online`, and every ~60s while
  the app is open and online.
- **Push:** Unsynced local records (`synced: false`) are upserted to
  Supabase by `client_id`. On success, mark `synced: true` locally.
- **Pull:** Fetch remote records with `updated_at > last_pull_at`, upsert
  into Dexie by `id`.
- **Conflict resolution:** Last-write-wins by `updated_at` timestamp —
  acceptable for single-user, effectively-single-active-session usage.
- **iOS Safari storage risk:** Safari may evict IndexedDB data after ~7
  days without the PWA/site being opened. Mitigation: sync-on-load
  re-pulls everything from Supabase, so eviction only costs a re-download
  as long as unsynced writes were pushed before the eviction window. A
  small "N unsynced changes" indicator in the UI surfaces anything stuck
  waiting for connectivity.

## 4. Frontend structure & key screens

- **Framework:** React + TypeScript, Vite, `vite-plugin-pwa` (precaches the
  app shell so the UI itself loads offline, not just data)
- **Routing:** react-router (client-side only, local-first SPA)
- **State/data layer:** Dexie live queries (`useLiveQuery`) drive the UI
  directly off IndexedDB; the sync engine runs underneath as a side process
- **Core screens:**
  1. **Animals list** (pigs/goats) → **Animal detail** (event timeline, add-event form)
  2. **Plots list** → **Plot detail** (event timeline, add-event form)
  3. **Quick-log** — fast "log an event" entry point from the home screen (feeding/expense are highest-frequency, lowest-friction case for the field-with-no-signal scenario)
  4. **Reports** — date-range picker, cost vs. revenue, filterable by animal type/plot (V2 per PRD milestones; data model supports it from day one)
  5. **Sign-in** — Supabase Auth email/password, persisted session

## 5. Error handling & testing

- **Error handling:** Local writes to Dexie are the only "hard" operation —
  failure (e.g. storage full/corrupted) shows a blocking error, since it
  violates the core offline guarantee. Sync push/pull failures are soft —
  logged, retried on the next sync tick, surfaced only via the unsynced-
  count indicator, never blocking the UI.
- **Testing:** Unit tests for the sync engine's push/pull/conflict logic
  (highest-risk, least-visible-when-broken part of this app) using an
  in-memory/fake Supabase client; component tests for forms and list
  views; no e2e/browser testing for v1 given single-user scope.

## Out of scope (per PRD non-goals)

Multi-user accounts, native app store distribution, IoT integration,
predictive analytics, multi-farm support.
