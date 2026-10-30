# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A multi-tenant CRM/dashboard for clinics (plastic surgery, medical, dental, generic; Portuguese-language UI, brand "Tem Horário"). Secretarial staff track leads through a WhatsApp-driven sales funnel (an n8n/Chatwoot/AI bot writes to `leads_clinica`; the app doesn't send messages itself), schedule/log consultations, and manage clinic settings. Each clinic is a row in `configuracoes_clinica`; users belong to exactly one (`usuarios.clinica_id`); a super admin (`usuarios.is_super_admin`) manages clinics at `/admin/clinicas` (URL only, not in the menu).

## Commands

```
npm run dev       # Vite dev server on port 5173
npm run build     # tsc typecheck + vite production build
npm run preview   # preview the production build
npm test          # vitest run (unit tests in src/lib/*.test.ts)
```

There is no lint script. Tests import `src/lib/supabase.ts` transitively, so they need `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` defined (a `.env`, or dummy values: `VITE_SUPABASE_URL=http://localhost VITE_SUPABASE_ANON_KEY=x npm test`). Only pure logic in `src/lib` is tested; pages, hooks and DB triggers are not.

## Database

The schema lives in `migrations/NNN_*.sql` (apply in order in the Supabase SQL Editor). The **base schema** (original tables, columns, defaults) comes from `setup_db.sh`, which is git-ignored because it contains a live project token — **never commit it**; so the migrations alone do not rebuild a database from scratch. Some numbers repeat (two `014_*`; `027` was renamed to `027_retornos_n8n`) — keep the order by name. Migrations are not all idempotent; read the header before re-running.

Key tables: `usuarios`, `configuracoes_clinica`, `convites_clinica`, `horario_comercial`, `servicos_clinica`, `leads_clinica`, `consultas`, `funil_etapas`, `mensagens_programadas`. RLS isolates by `clinica_id` through `current_clinica_id()` / `current_user_is_super_admin()` (migrations 009–012). The app still filters by `clinica_id` in the client as well.

Business rules that live **in the database** (triggers; the UI only mirrors them): consultation `agendada`/`realizada`/`cancelada`/`faltou` moves the lead status (018, 023, 029, 030), last `realizada` can't be deleted (017/030), `status_atualizado_em` stamping, `tag_paciente_recorrente` (028), and `atendimento_manual` suppressing automatic stage changes (029). `verifica_retornos_proximos` (pg_cron) is superseded by the n8n return flow (027).

## Architecture

**Stack:** Vite + React 18 + TypeScript (strict) + React Router v7 + Tailwind + Supabase (Postgres, Auth, Storage, Realtime) + Recharts + dnd-kit + Vitest.

**State:** no data-fetching library. `AuthContext` loads profile, clinic and `funil_etapas` once; pages own their Supabase queries via `useEffect`/`useCallback` and local `useState`. Realtime uses `supabase.channel(...).on('postgres_changes', ...)` (`CRM.tsx`, `LeadDetail.tsx`).

**Routing (`src/App.tsx`):** `/login` public; everything else under `ProtectedRoute` + `AppLayout` (collapsible `Sidebar`). Pages: `/` Dashboard, `/crm` Kanban, `/leads` table, `/leads/:id`, `/configuracoes`, `/admin/clinicas` (`AdminRoute`).

**The lead funnel is the core concept.**
- Status keys are fixed technical keys (`CHAVES_FUNIL` in `src/lib/funil.ts`); the n8n bot and DB triggers write them. Each clinic only changes label, order and rules per stage in `funil_etapas` (edited at `/admin/clinicas` via `FunilEditor`).
- **Dobras:** a stage with `mapeia_para` is folded into another column. The lead keeps its real key in the DB but is shown in the destination column. `useFunil()` (`resolverFunil`) returns `visiveis` (columns), `ocultas`, `labels`, `statusExibido` (real key → column key), `exigeConsulta`, `pacienteKeys`. **Always resolve through `statusExibido` for labels/colors/column placement, never compare raw keys against column ids** — except for rules tied to a real key (e.g. `ehOrcamento()` = `orcamento_pendente` or `consulta_realizada`, which decides whether the return can be classified).
- Rules: `src/lib/statusRules.ts` (needs a done consultation / a scheduled one, automatic-only stages, stalled-lead alerts). Manual attendance mode (`atendimento_manual`) skips these client-side checks.
- Pages: `CRM.tsx` (Kanban, optimistic update + rollback), `Leads.tsx` (Contatos / Pacientes / Ex-pacientes tabs; CSV and print-to-PDF export), `LeadDetail.tsx` (status, notes, consultas CRUD, return classification), `Dashboard.tsx` (KPIs and charts computed client-side; leads are fetched in 1000-row pages).

**Timezone:** the app assumes `America/Sao_Paulo`. Use `src/lib/dateRange.ts`: `nowSP()`/`toSP()` for "now"/wall-clock Dates, `fmt()` to format those Dates (local components, not UTC), `diaSP()`/`diaSemanaSP()` to bucket stored timestamps. Don't use `toISOString().split('T')[0]` for day logic.

**Styling:** Tailwind theme tokens in `tailwind.config.js` backed by CSS variables (light/dark via `ThemeContext`). Stage colors are centralized in `src/lib/statusColors.ts`.

**Uploads** (`Configuracoes.tsx`): Supabase Storage buckets `avatars`/`logos`, client-side type/size validation (5MB, jpeg/png/webp/gif), `getPublicUrl` + `?t=timestamp`. Cross-component refresh uses `window` events (`clinic-logo-updated`, `user-profile-updated`).

## Environment

Requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` (see `.env.example`). `.env` and `setup_db.sh` are git-ignored — never commit either. Deploy: `Dockerfile` + `deploy/nginx.conf` (EasyPanel).
