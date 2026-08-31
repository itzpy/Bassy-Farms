# Product Requirements Document: Farm Management App

**Author:** [Your name]
**Status:** Draft
**Last updated:** 31 August 2026

---

## 1. Summary

A mobile-and-laptop-accessible application for managing a small mixed farm (piggery, goats, and crop farming), enabling digital record-keeping of livestock, crop plots, and farm finances, replacing paper-based tracking. Built offline-first so it remains usable with no connectivity, syncing to the cloud when a connection is available.

## 2. Problem statement

The farm currently relies on manual/paper-based (or memory-based) tracking of:
- Livestock health, feeding, and breeding records
- Crop planting and harvest cycles
- Farm income and expenses

This makes it difficult to answer basic operational questions (e.g. "is the piggery profitable?", "when was this goat last vaccinated?") and creates risk of data loss (paper records, no backup).

## 3. Goals

| Goal | Success looks like |
|---|---|
| Digitise record-keeping | All new livestock/crop/financial events logged in-app, not on paper |
| Enable profitability visibility | Can view cost vs. revenue per animal type / plot over a date range |
| Work without reliable connectivity | Core logging functions (add event, view records) work fully offline |
| Prevent data loss | Data is backed up to the cloud, recoverable if the device is lost/broken |
| Usable across devices | Same data accessible from phone and laptop |

### Non-goals (v1)

- Multi-user accounts / farmhand access with permissions
- Native mobile app store distribution
- Automated IoT sensor integration (e.g. smart feeders, weight scales)
- Predictive analytics / ML-based recommendations
- Multi-farm support

These are plausible future phases but are explicitly out of scope to avoid over-engineering v1.

## 4. Users

**Primary user:** One farm owner/operator (the only user in v1), managing piggery, goats, and crop plots personally.

**Usage context:** Primarily on a mobile phone while physically on the farm (often with poor or no mobile signal), occasionally on a laptop (e.g. for reviewing records or entering data at day's end).

## 5. Key use cases

1. **Log a livestock event** — record feeding, vaccination, weight check, health issue, or death for a specific pig or goat, while standing in the field with no signal.
2. **Log a crop event** — record planting or harvest for a plot.
3. **Log an expense or sale** — record money spent (e.g. feed, vet visit) or earned (e.g. sold two pigs), tagged to an animal, plot, or the farm generally.
4. **Review an animal's history** — see the full timeline of events for a specific animal (useful before a vet visit or sale).
5. **View profitability** — see total expenses vs. revenue over a date range, filterable by livestock type or plot.
6. **Access records from a different device** — open the laptop at the end of the day and see everything logged on the phone, and vice versa.
7. **Recover data after device loss** — get a new phone, log in, and see all historical records intact.

## 6. Functional requirements

### 6.1 Livestock management
- Add/edit/view pigs and goats with: type, tag/identifier, birth date, status (active/sold/deceased), notes
- Log events against an animal: feeding, vaccination, weight, health check, breeding, death

### 6.2 Crop management
- Add/edit/view crop plots with: name, crop type, planted date, area, notes
- Log events against a plot: planting, harvest

### 6.3 Financial tracking
- Log expense events (optionally tagged to an animal, plot, or farm-wide)
- Log sale events (optionally tagged to an animal or plot)
- View aggregated cost/revenue over a selectable date range, filterable by category

### 6.4 Sync & offline
- All logging functions available with no network connection
- Locally stored data syncs automatically once connectivity is restored
- Conflict handling via last-write-wins (acceptable given single-user usage)

### 6.5 Access & security
- Single shared credential (API key) gates access to farm data
- Data accessible from both phone (installed PWA) and laptop (browser)

## 7. Non-functional requirements

| Category | Requirement |
|---|---|
| **Offline reliability** | Logging an event must never fail due to lack of connectivity |
| **Data durability** | Data survives loss/damage of any single device (cloud-backed) |
| **Performance** | App must load and be usable in under 2 seconds on a mid-range Android phone |
| **Cost** | Hosting cost should fit within free/low-cost tiers appropriate for single-user scale |
| **Maintainability** | Codebase should be simple enough for one developer to extend without a rewrite as usage grows |

## 8. Proposed architecture (high level)

- **Frontend:** Progressive Web App (React + TypeScript), works on both phone and laptop from one codebase; local-first storage (IndexedDB via Dexie.js) so all core functions work offline
- **Backend:** Node.js + TypeScript API (Fastify), single shared API-key auth
- **Database:** Postgres (hosted, e.g. Supabase), with a generic event-log table underpinning livestock, crop, and financial records
- **Sync model:** Last-write-wins, based on client-side timestamps

*(See accompanying technical design notes for full schema and API details.)*

## 9. Risks & open questions

| Risk / question | Notes |
|---|---|
| Data model may need revision after real-world use | Mitigated by generic `events` table design, but should be validated with a few weeks of real usage before over-building reporting features |
| Single shared API key is not real authentication | Acceptable for single-user v1; must be upgraded before any multi-user phase |
| Offline sync conflicts | Low risk for single-user, single-active-session usage; revisit if farmhands get access later |
| Device/OS support unknown | Need to confirm which phone/browser the primary user actually has, to validate PWA install support |

## 10. Milestones (suggested phasing)

1. **V1 — Core logging:** Livestock + plot CRUD, event logging, offline-first storage, sync to backend, API key auth
2. **V2 — Financial visibility:** Profitability views/dashboards over the event log
3. **V3 (future, optional):** Multi-user/farmhand access with real authentication, reminders/notifications (e.g. vaccination due), richer reporting
