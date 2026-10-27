# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A CRM/dashboard for a plastic surgery clinic (Portuguese-language UI). Secretarial staff track leads through a WhatsApp-driven sales funnel (a Chatwoot/AI bot integration writes to `leads_clinica`; the app doesn't send messages itself), schedule/log consultations, and manage clinic settings. Single-tenant: there is exactly one clinic per Supabase project (`configuracoes_clinica` always has one row, fetched with `.limit(1).maybeSingle()`).

## Commands

```
npm run dev       # start Vite dev server on port 5173 (auto-opens browser)
npm run build     # tsc typecheck + vite production build
npm run preview   # preview the production build
```

There is no lint script and no test suite/framework configured — don't invent `npm run lint` or `npm test` commands.

## Database setup

`setup_db.sh` provisions the Supabase backend (tables, RLS policies, a `pg_cron` job) via the Supabase Management API. It is git-ignored because it contains a live project token — **never commit it**. Treat it as the source of truth for schema when `.env`/database access isn't available; the tables it creates are: `usuarios`, `configuracoes_clinica`, `horario_comercial`, `servicos_clinica`, `leads_clinica`, `consultas`. All tables have RLS enabled with an "any authenticated user" policy (except `usuarios`, which is scoped to the owning row) — there's no per-clinic multi-tenancy or role separation.

`leads_clinica.status` is a checked enum driving the whole funnel UI (see Architecture below) — if it's ever extended, update the check constraint in `setup_db.sh` **and** every `STATUS_BADGE`/`COLUMNS`/`STATUS_OPTIONS` map listed there.

## Architecture

**Stack:** Vite + React 18 + TypeScript (strict mode) + React Router v7 + Tailwind + Supabase (Postgres, Auth, Storage, Realtime) + Recharts + dnd-kit.

**No global state management, no data-fetching library.** Every page owns its Supabase queries directly via `supabase.from(...)` in `useEffect`/`useCallback`, with local `useState`. Realtime updates use `supabase.channel(...).on('postgres_changes', ...)` subscriptions (see `CRM.tsx` and `LeadDetail.tsx`) rather than refetching.

**Routing (`src/App.tsx`):** `/login` is public; everything else is wrapped in `ProtectedRoute` (checks `supabase.auth.onAuthStateChange`) and rendered inside `AppLayout`, which pairs a persistent collapsible `Sidebar` with a `Routes` outlet. Pages: `/` (Dashboard), `/crm` (Kanban), `/leads` (table + detail), `/leads/:id`, `/configuracoes`.

**The lead funnel is the core domain concept.** A lead's `status` column (see check constraint above) drives:
- `CRM.tsx` — a dnd-kit Kanban board, one column per status, dragging a card updates `leads_clinica.status` (optimistic update + rollback on Supabase error).
- `Leads.tsx` — a filterable/sortable table view of the same data, split into two tabs by whether `status` is in `PATIENT_STATUS` (`consulta_realizada`, `paciente_recorrente`) — i.e. "Leads" (contacts) vs "Pacientes" (patients who've had a consultation). Also supports CSV export (client-side) and PDF export (opens a new window, writes a print-styled HTML document, calls `window.print()`).
- `LeadDetail.tsx` — single-lead view with editable status, notes, and its own `consultas` (appointments) sub-table.
- `Dashboard.tsx` — KPIs and charts (Recharts) computed client-side from the full `leads_clinica` + `horario_comercial` result sets (no server-side aggregation).

Status label/color metadata (`STATUS_BADGE`, `COLUMNS`, `STATUS_OPTIONS`) is duplicated per-file rather than shared — when adding/renaming a status, update it in all of: `CRM.tsx`, `Leads.tsx`, `Dashboard.tsx`, `LeadDetail.tsx`, and the DB check constraint in `setup_db.sh`.

**Timezone handling:** the whole app assumes `America/Sao_Paulo`. Period-range and "now" helpers (`nowSP()`/`toSP()`, duplicated in `Dashboard.tsx` and `Leads.tsx`) convert via `toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })` before doing date arithmetic — follow this pattern for any new date logic instead of using raw `Date`/UTC.

**Styling:** Tailwind with a custom theme (`tailwind.config.js`) defining `accent`/`success`/`page`/`card`/`border`/`text` colors and the `card` radius/shadow tokens. Older pages (`CRM.tsx`, `Leads.tsx`, `LeadDetail.tsx`, `Configuracoes.tsx`) use raw hex literals in `className`/`style` instead of the theme tokens (e.g. `#B85C72` instead of `accent`); `Dashboard.tsx`, `Login.tsx`, `Sidebar.tsx` use the theme tokens. Prefer the theme tokens in new code, but match the surrounding file's convention when editing an existing page.

**File uploads** (`Configuracoes.tsx`, `UploadAvatar`): go straight to Supabase Storage buckets `avatars`/`logos` with client-side type/size validation (5MB, jpeg/png/webp/gif), then `getPublicUrl` + a cache-busting `?t=timestamp` query param. Cross-component refresh after a logo/profile change is done via custom `window` events (`clinic-logo-updated`, `user-profile-updated`) that `Sidebar.tsx` listens for — follow this pattern rather than introducing a state library if another component needs to react to the same changes.

## Environment

Requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` (see `.env.example`). `.env` and `setup_db.sh` are both git-ignored — never commit either.
