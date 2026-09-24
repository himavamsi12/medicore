@AGENTS.md

# MediCore HMS

Frontend-only hospital management system for a multispecialty hospital in Bengaluru.
All data is mock data served through a typed, promise-based service layer, so a real
backend can be connected by changing `src/services` only.

## Commands

```bash
pnpm dev          # dev server
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint (includes the data-access architecture rule)
pnpm check        # typecheck + lint
pnpm build        # production build
```

Run `pnpm check` and `pnpm build` after every change set. Both must be clean.

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript strict · Tailwind v4 · shadcn/ui on
**Base UI** (not Radix: use the `render` prop instead of `asChild`) · TanStack Query ·
TanStack Table **v9** (`useTable` + `tableFeatures`, not v8 `useReactTable`) ·
Recharts 3 · motion (`motion/react`) · Zustand · date-fns · react-hook-form + zod ·
cmdk · lucide-react.

Next 16 notes: `params` / `searchParams` are async in server components; client pages
use `useParams()` / `useSearchParams()`. `useSearchParams` needs a Suspense boundary,
which `src/app/(app)/layout.tsx` provides for every app route.

## Architecture

```
src/
  app/(app)/…         routes (client pages); layout renders AppShell
  app/(print)/…       chrome-less printable views
  components/
    ui/               shadcn primitives (Base UI). Restyled via tokens, not per use.
    shell/            Sidebar, Topbar, RoleSwitcher, CommandBar (Cmd+K), AppShell (role gate)
    data/             DataTable (TanStack v9, server mode), filters, KpiTile
    charts/           TrendChart, BarsChart, Sparkline, ChartCard (with table view)
    ai/               AiPanel, AiDisclaimer, ConfidenceMeter, useAiStream, RiskScoreCard, ReviewBar
    feedback/         StatusBadge (single status→tone map), Empty/Error/Access states, skeletons
    layout/           PageHeader, Panel, Field
  features/<module>/  module-specific components
  hooks/              useListParams (URL-synced list state), useCurrentUser, useNow, useHydrated
  services/           THE ONLY LAYER THAT TOUCHES DATA
  data/               mock database (seeded generators, reference data, AI content)
  types/              domain types + view models (views.ts = API contract)
  lib/                pure helpers: format, clinical (NEWS2, flags), billing-math, rbac, nav, dates
  stores/             Zustand: session (role), ui (sidebar, recent patients)
```

### Data flow

`component → TanStack Query → services/*Service.ts → mock() → data/db.ts`

- **Never import `@/data/*` outside `src/services` and `src/data`.** ESLint enforces this
  (`no-restricted-imports`). `src/lib` must stay pure and must not import data either.
- Every service function returns a `Promise`. `mock()` in `services/http.ts` adds
  200-600 ms latency (override with `NEXT_PUBLIC_MOCK_LATENCY_MIN/MAX`) and deep-clones
  results so UI code cannot mutate the store.
- List endpoints take `ListParams` (`search`, `filters`, `sort[]`, `page`, `pageSize`,
  `dateFrom`, `dateTo`) and return `Paginated<T>`. `services/query.ts#runQuery` implements
  this contract; `DataTable` runs in manual (server) mode against it.
- Mutations write to the in-memory store, so they persist until reload.
- Query keys start with the domain name (`["patients", …]`, `["admissions", …]`) so a
  mutation can invalidate a whole domain.

### Mock data

- `data/db.ts#getDb()` lazily builds everything with seeded PRNGs (`data/seed/random.ts`).
  Output is deterministic apart from being anchored to "now" (`data/seed/clock.ts`), so
  "today", "this week" and "overdue" always read naturally.
- `data/reference/profiles.ts` defines clinical archetypes. Each patient gets one, which
  keeps conditions, meds, labs, vitals, imaging, admissions and bills coherent.
- Showcase patients (`data/build/people.ts#SHOWCASE`) are placed deliberately
  (e.g. PAT-0009 deteriorating pneumonia in HDU, PAT-0005 heart failure on warfarin with
  an aspirin allergy in today's OPD) to demonstrate AI features.
- `CLINIC_NOW`: outside clinic hours (before 09:30, after 17:30) the OPD behaves as if it
  is 11:20 today so queues look alive. Services use `clinicNow()` for OPD waits.
- `data/analytics.ts` holds 180 days of pre-aggregated metrics for reports/forecasts.
- Timestamps are ISO UTC. Bucket by day with `lib/dates#localDate()`; never
  `iso.slice(0, 10)` (IST is +05:30).

### AI features

All AI goes through `services/aiService.ts` (patient summary stream, lab interpretation,
risk scores, prescription safety check, scribe, triage, radiology findings, forecasts,
claim audit / missing charges, command bar). Content lives in `data/ai/*` and is always
filled with facts from the actual record. UI rules:

- Every AI surface uses `AiPanel` / `AiDisclaimer` ("AI suggestion · Requires clinician
  review") and shows confidence (`ConfidenceMeter`) and sources.
- AI output is never applied automatically: use `ReviewBar` (Accept / Edit / Dismiss).
- Risk scores always show contributing factors.

## Replacing mock services with a real backend

1. Keep every exported service signature and the types in `src/types` (especially
   `views.ts`, `Paginated<T>`, `ListParams`). These are the API contract.
2. In each `services/*Service.ts`, replace `mock(() => …)` bodies with calls through the
   `api` client in `services/http.ts`, e.g.
   `getAll: (p) => api.get<Paginated<PatientListItem>>(\`/patients?\${toQuery(p)}\`)`.
   Set `NEXT_PUBLIC_API_BASE_URL`.
3. Map server errors to `ServiceError` (status + message); the UI already renders
   `ErrorState` and toasts from thrown errors.
4. For `aiService.streamPatientSummary`, return `{ meta, stream }` where `stream` is an
   `AsyncIterable<string>` over your LLM's SSE/streamed tokens.
5. Replace `sessionService` and `lib/rbac.ts` with your auth provider's user and
   permission claims; components only call `can()` / `canAccess()`.
6. Replace `notificationService.pollActivity` with a websocket/SSE subscription that
   feeds the same query key.
7. Delete `src/data` once nothing imports it (ESLint rule guarantees only services do).

## UI conventions

Design language: calm clinical, Linear-level restraint, dense but readable.

- **Tokens only** (`src/app/globals.css`). One accent (cobalt `--primary`). Status colours
  (`critical / warning / stable / info / neutral`) are for state only and always come with
  a text label: use `StatusBadge` and `statusTone()`; add new statuses to its map.
- **Shape lock:** controls 6px (`rounded-lg`), cards and panels 10px (`rounded-xl`),
  badges pill. Hairline borders; shadows only on popovers.
- **Type:** Geist Sans / Geist Mono. Table numbers use `.num` (mono, tabular) or the
  `numeric` column meta; large KPI values use proportional sans (dataviz rule).
- **Copy:** no em dashes, no emojis, plain specific language, sentence case.
- **Charts:** only via `components/charts`. Series colours are the validated palette
  (`--chart-1..5`, CVD-checked in both themes) in fixed order; never dual axes; a legend
  for 2+ series; `ChartCard` provides a table view (required: slots 3-5 are under 3:1 on
  the light surface).
- **Tables:** always `DataTable` + `useListParams` (URL state) with search, filters,
  sorting, pagination, skeleton, empty and error states, and a `mobileCard` for < md.
- **States:** every data view has loading (shape-matched skeleton), empty and error states.
- **Hydration:** page content renders after hydration (AppShell) because all data is
  client-side. Use `useHydrated()` for any client-only text, `useNow()` for time in render.
- **Accessibility:** labels above inputs, visible focus rings, `aria-*` on custom
  controls, keyboard support (Cmd/Ctrl+K or `/` for the command bar, `[` toggles sidebar).
- **Icons:** lucide-react, `strokeWidth={ICON_STROKE}` (1.75).
- **Motion:** `motion/react`, transform/opacity only, `MotionConfig reducedMotion="user"`.
- **Navigation:** add routes to `NAV` in `lib/nav.ts`, role access in `lib/rbac.ts`, and
  add the route to `BUILT_ROUTES` once the page exists (unbuilt routes stay hidden).

## RBAC

Roles: Admin, Doctor, Nurse, Receptionist, Lab Technician, Pharmacist, Billing.
`ROUTE_ACCESS` gates routes (AppShell shows an access state with a role switcher);
`PERMISSIONS` + `can(role, perm)` gate actions. Personas per role are in `ROLE_PERSONA`.
