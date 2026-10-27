-- 013: nicho da clínica e funil configurável (rótulos, ordem e regras por etapa).
--
-- As CHAVES técnicas de leads_clinica.status continuam fixas: o n8n/Chatwoot
-- e os triggers das migrations 006/007 dependem delas. Esta migration só
-- guarda, por clínica, o rótulo, a ordem e as duas regras de cada etapa.
--
-- Não aplicar sem revisão. Ordem sugerida: aplicar esta migration e, em
-- seguida, publicar o frontend que lê funil_etapas (src/lib/funil.ts).

-- ─── 1. Nicho na clínica ───────────────────────────────────────────────────
alter table public.configuracoes_clinica
  add column if not exists nicho text not null default 'estetica';

alter table public.configuracoes_clinica
  drop constraint if exists configuracoes_clinica_nicho_check;

alter table public.configuracoes_clinica
  add constraint configuracoes_clinica_nicho_check
  check (nicho in ('estetica', 'medica', 'odontologica', 'generico'));

-- ─── 2. Etapas do funil por clínica ────────────────────────────────────────
create table if not exists public.funil_etapas (
  id                        uuid primary key default gen_random_uuid(),
  clinica_id                uuid not null references public.configuracoes_clinica(id) on delete cascade,
  chave                     text not null,
  rotulo                    text not null,
  ordem                     integer not null,
  exige_consulta_realizada  boolean not null default false,
  e_paciente                boolean not null default false,
  unique (clinica_id, chave),
  constraint funil_etapas_chave_check check (chave in (
    'iniciou_conversa', 'conversando', 'follow_up_1_feito', 'follow_up_2_feito',
    'consulta_agendada', 'follow_up_3_feito', 'consulta_cancelada',
    'consulta_realizada', 'paciente_recorrente',
    'retornar_3_meses', 'retornar_6_meses', 'retornar_1_ano'
  ))
);

alter table public.funil_etapas enable row level security;

drop policy if exists "funil_all_by_clinica_or_admin" on public.funil_etapas;
create policy "funil_all_by_clinica_or_admin"
  on public.funil_etapas
  for all
  using (clinica_id = public.current_clinica_id() or public.current_user_is_super_admin())
  with check (clinica_id = public.current_clinica_id() or public.current_user_is_super_admin());

-- ─── 3. Gabaritos por nicho ────────────────────────────────────────────────
-- Espelha GABARITO em src/lib/funil.ts. Se mudar um, mude o outro.
create or replace function public.gabarito_funil(p_nicho text)
returns table (chave text, rotulo text, ordem integer, exige_consulta_realizada boolean, e_paciente boolean)
language sql
immutable
set search_path = public
as $$
  with g(nicho, chave, rotulo, ordem) as (values
    ('estetica','iniciou_conversa','Iniciou Conversa',1),
    ('estetica','conversando','Conversando',2),
    ('estetica','follow_up_1_feito','Reengajamento 1',3),
    ('estetica','follow_up_2_feito','Reengajamento 2',4),
    ('estetica','consulta_agendada','Consulta Agendada',5),
    ('estetica','follow_up_3_feito','Confirmação de Consulta',6),
    ('estetica','consulta_cancelada','Consulta Cancelada',7),
    ('estetica','consulta_realizada','Consulta Realizada',8),
    ('estetica','paciente_recorrente','Paciente Recorrente',9),
    ('estetica','retornar_3_meses','Retornar em 3 meses',10),
    ('estetica','retornar_6_meses','Retornar em 6 meses',11),
    ('estetica','retornar_1_ano','Retornar em 1 ano',12),
    ('medica','iniciou_conversa','Novo Contato',1),
    ('medica','conversando','Em Atendimento',2),
    ('medica','follow_up_1_feito','Contato 1',3),
    ('medica','follow_up_2_feito','Contato 2',4),
    ('medica','consulta_agendada','Consulta Agendada',5),
    ('medica','follow_up_3_feito','Confirmação de Consulta',6),
    ('medica','consulta_cancelada','Consulta Cancelada',7),
    ('medica','consulta_realizada','Consulta Realizada',8),
    ('medica','paciente_recorrente','Paciente Recorrente',9),
    ('medica','retornar_3_meses','Retorno em 3 meses',10),
    ('medica','retornar_6_meses','Retorno em 6 meses',11),
    ('medica','retornar_1_ano','Retorno em 1 ano',12),
    ('odontologica','iniciou_conversa','Novo Contato',1),
    ('odontologica','conversando','Orçamento em Negociação',2),
    ('odontologica','follow_up_1_feito','Contato 1',3),
    ('odontologica','follow_up_2_feito','Contato 2',4),
    ('odontologica','consulta_agendada','Avaliação Agendada',5),
    ('odontologica','follow_up_3_feito','Confirmação de Avaliação',6),
    ('odontologica','consulta_cancelada','Avaliação Cancelada',7),
    ('odontologica','consulta_realizada','Avaliação Realizada',8),
    ('odontologica','paciente_recorrente','Paciente Ativo',9),
    ('odontologica','retornar_3_meses','Retorno em 3 meses',10),
    ('odontologica','retornar_6_meses','Retorno em 6 meses',11),
    ('odontologica','retornar_1_ano','Retorno em 1 ano',12),
    ('generico','iniciou_conversa','Novo Contato',1),
    ('generico','conversando','Em Conversa',2),
    ('generico','follow_up_1_feito','Reengajamento 1',3),
    ('generico','follow_up_2_feito','Reengajamento 2',4),
    ('generico','consulta_agendada','Agendado',5),
    ('generico','follow_up_3_feito','Confirmação',6),
    ('generico','consulta_cancelada','Cancelado',7),
    ('generico','consulta_realizada','Concluído',8),
    ('generico','paciente_recorrente','Cliente Recorrente',9),
    ('generico','retornar_3_meses','Retornar em 3 meses',10),
    ('generico','retornar_6_meses','Retornar em 6 meses',11),
    ('generico','retornar_1_ano','Retornar em 1 ano',12)
  )
  select g.chave, g.rotulo, g.ordem,
         g.chave in ('consulta_realizada','paciente_recorrente','retornar_3_meses','retornar_6_meses','retornar_1_ano'),
         g.chave in ('consulta_realizada','paciente_recorrente','retornar_3_meses','retornar_6_meses','retornar_1_ano')
  from g
  where g.nicho = p_nicho
  order by g.ordem
$$;

-- ─── 4. Aplicar um nicho a uma clínica ─────────────────────────────────────
-- Grava as etapas do gabarito. Com p_sobrescrever = true, rótulos e ordem
-- personalizados são substituídos. A chave é sempre a do gabarito.
create or replace function public.aplicar_nicho(p_clinica uuid, p_nicho text, p_sobrescrever boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_clinica is distinct from public.current_clinica_id()
     and not public.current_user_is_super_admin() then
    raise exception 'Sem permissão para configurar esta clínica';
  end if;

  if p_nicho not in ('estetica', 'medica', 'odontologica', 'generico') then
    raise exception 'Nicho inválido: %', p_nicho;
  end if;

  update public.configuracoes_clinica set nicho = p_nicho where id = p_clinica;

  insert into public.funil_etapas (clinica_id, chave, rotulo, ordem, exige_consulta_realizada, e_paciente)
  select p_clinica, g.chave, g.rotulo, g.ordem, g.exige_consulta_realizada, g.e_paciente
  from public.gabarito_funil(p_nicho) g
  on conflict (clinica_id, chave) do update
    set rotulo = case when p_sobrescrever then excluded.rotulo else public.funil_etapas.rotulo end,
        ordem  = case when p_sobrescrever then excluded.ordem  else public.funil_etapas.ordem  end,
        exige_consulta_realizada = excluded.exige_consulta_realizada,
        e_paciente               = excluded.e_paciente;
end;
$$;

revoke all on function public.aplicar_nicho(uuid, text, boolean) from public, anon;
grant execute on function public.aplicar_nicho(uuid, text, boolean) to authenticated;

-- ─── 5. Clínicas novas nascem com o funil do próprio nicho ─────────────────
create or replace function public.configuracoes_clinica_seed_funil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.funil_etapas (clinica_id, chave, rotulo, ordem, exige_consulta_realizada, e_paciente)
  select new.id, g.chave, g.rotulo, g.ordem, g.exige_consulta_realizada, g.e_paciente
  from public.gabarito_funil(new.nicho) g
  on conflict (clinica_id, chave) do nothing;
  return new;
end;
$$;

drop trigger if exists configuracoes_clinica_seed_funil_trg on public.configuracoes_clinica;
create trigger configuracoes_clinica_seed_funil_trg
  after insert on public.configuracoes_clinica
  for each row
  execute function public.configuracoes_clinica_seed_funil();

revoke all on function public.configuracoes_clinica_seed_funil() from public, anon, authenticated;

-- ─── 6. Backfill: clínicas que já existem recebem o funil de estética ──────
-- Mantém exatamente o comportamento atual (mesmos rótulos).
insert into public.funil_etapas (clinica_id, chave, rotulo, ordem, exige_consulta_realizada, e_paciente)
select cc.id, g.chave, g.rotulo, g.ordem, g.exige_consulta_realizada, g.e_paciente
from public.configuracoes_clinica cc
cross join lateral public.gabarito_funil(cc.nicho) g
on conflict (clinica_id, chave) do nothing;
