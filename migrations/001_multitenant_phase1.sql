-- Fase 1 do plano multitenant (ver plan.md na raiz do repo).
-- Aditiva e não-destrutiva: só adiciona colunas nullable + índices.
-- Não toca em RLS, não adiciona a constraint composta de horario_comercial
-- (aguarda o backfill da Fase 2), e não altera o frontend.
-- Executado via migrations/001_multitenant_phase1.sh (gitignored, contém o token
-- de Management API do Supabase — mesmo padrão do setup_db.sh).

-- configuracoes_clinica vira a tabela raiz do tenant.
alter table public.configuracoes_clinica
  add column if not exists numero_whatsapp text;

alter table public.configuracoes_clinica
  add constraint configuracoes_clinica_numero_whatsapp_key unique (numero_whatsapp);

-- usuarios: um usuário pertence a exatamente uma clínica.
alter table public.usuarios
  add column if not exists clinica_id uuid references public.configuracoes_clinica(id);

create index if not exists usuarios_clinica_id_idx
  on public.usuarios (clinica_id);

-- leads_clinica: coluna de isolamento principal (funil de leads por clínica).
alter table public.leads_clinica
  add column if not exists clinica_id uuid references public.configuracoes_clinica(id);

create index if not exists leads_clinica_clinica_id_idx
  on public.leads_clinica (clinica_id);

create index if not exists leads_clinica_clinica_id_status_idx
  on public.leads_clinica (clinica_id, status);

-- horario_comercial: passa de 7 linhas globais para 7 por clínica.
-- A constraint unique(clinica_id, dia_semana) fica para a Fase 2, após o backfill.
alter table public.horario_comercial
  add column if not exists clinica_id uuid references public.configuracoes_clinica(id);

create index if not exists horario_comercial_clinica_id_idx
  on public.horario_comercial (clinica_id);

-- servicos_clinica: passa de lista global para lista por clínica.
alter table public.servicos_clinica
  add column if not exists clinica_id uuid references public.configuracoes_clinica(id);

create index if not exists servicos_clinica_clinica_id_idx
  on public.servicos_clinica (clinica_id);

-- consultas: sem mudança — herda o tenant via lead_id -> leads_clinica.clinica_id.
