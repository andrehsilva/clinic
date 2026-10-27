-- 023: funil com Confirmado e Orçamento Pendente + carimbo de etapa.
--
-- Novas chaves: consulta_confirmada (paciente confirmou o horário) e
-- orcamento_pendente (avaliação feita, plano em aberto). Não existe etapa de
-- "Compareceu": do Confirmado a secretária vai direto para Realizado ou Reagendar.
-- A consulta marcada como 'realizada' passa a levar o lead para
-- orcamento_pendente — antes levava para paciente_recorrente, que agora é a
-- etapa manual "Reagendado".
-- consultas ganha o status 'faltou', que leva o lead para "Cancelada / Falta".
-- status_atualizado_em carimba a hora de cada mudança de etapa (alerta de 48h).
--
-- Não aplicar sem revisão. Rodar no SQL Editor do Supabase, em uma transação.

begin;

-- 1. Novas chaves no status do lead
alter table public.leads_clinica
  drop constraint if exists leads_clinica_status_check;
alter table public.leads_clinica
  add constraint leads_clinica_status_check
  check (status in (
    'iniciou_conversa','conversando','follow_up_1_feito','follow_up_2_feito',
    'consulta_agendada','follow_up_3_feito','consulta_confirmada','consulta_cancelada',
    'consulta_realizada','orcamento_pendente','paciente_recorrente',
    'retornar_3_meses','retornar_6_meses','retornar_1_ano'
  ));

-- 2. funil_etapas: chaves novas nos checks
alter table public.funil_etapas
  drop constraint if exists funil_etapas_chave_check;
alter table public.funil_etapas
  add constraint funil_etapas_chave_check check (chave in (
    'iniciou_conversa','conversando','follow_up_1_feito','follow_up_2_feito',
    'consulta_agendada','follow_up_3_feito','consulta_confirmada','consulta_cancelada',
    'consulta_realizada','orcamento_pendente','paciente_recorrente',
    'retornar_3_meses','retornar_6_meses','retornar_1_ano'
  ));

alter table public.funil_etapas
  drop constraint if exists funil_etapas_mapeia_para_check;
alter table public.funil_etapas
  add constraint funil_etapas_mapeia_para_check check (
    mapeia_para is null
    or (mapeia_para in (
      'iniciou_conversa','conversando','follow_up_1_feito','follow_up_2_feito',
      'consulta_agendada','follow_up_3_feito','consulta_confirmada','consulta_cancelada',
      'consulta_realizada','orcamento_pendente','paciente_recorrente',
      'retornar_3_meses','retornar_6_meses','retornar_1_ano'
    ) and mapeia_para <> chave)
  );

-- 3. "Faltou" nas consultas (no-show da secretária)
alter table public.consultas
  drop constraint if exists consultas_status_check;
alter table public.consultas
  add constraint consultas_status_check
  check (status in ('agendada','realizada','cancelada','faltou'));

-- 4. Carimbo de mudança de etapa
alter table public.leads_clinica
  add column if not exists status_atualizado_em timestamptz not null default now();

update public.leads_clinica
set status_atualizado_em = coalesce(ultima_mensagem, created_at, now());

create or replace function public.leads_clinica_carimba_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.status_atualizado_em := now();
  end if;
  return new;
end;
$$;

drop trigger if exists leads_clinica_carimba_status_trg on public.leads_clinica;
create trigger leads_clinica_carimba_status_trg
  before insert or update on public.leads_clinica
  for each row
  execute function public.leads_clinica_carimba_status();

revoke all on function public.leads_clinica_carimba_status() from public, anon;

-- 5. Gabarito: 14 etapas na ordem do documento
create or replace function public.gabarito_funil(p_nicho text)
returns table (chave text, rotulo text, ordem integer, exige_consulta_realizada boolean, e_paciente boolean)
language sql
immutable
set search_path = public
as $$
  with g(nicho, chave, rotulo, ordem) as (values
    ('estetica','iniciou_conversa','Iniciou Conversa',1),
    ('estetica','conversando','Conversando',2),
    ('estetica','follow_up_1_feito','Reengajamento',3),
    ('estetica','follow_up_2_feito','Reengajamento 2',4),
    ('estetica','consulta_agendada','Consulta Agendada',5),
    ('estetica','follow_up_3_feito','Aguardando Confirmação',6),
    ('estetica','consulta_confirmada','Confirmado',7),
    ('estetica','consulta_cancelada','Cancelada / Falta',8),
    ('estetica','consulta_realizada','Consulta Realizada',9),
    ('estetica','orcamento_pendente','Orçamento Pendente',10),
    ('estetica','paciente_recorrente','Reagendado',11),
    ('estetica','retornar_3_meses','Retorno',12),
    ('estetica','retornar_6_meses','Retorno 6 meses',13),
    ('estetica','retornar_1_ano','Retorno 1 ano',14),
    ('medica','iniciou_conversa','Novo Contato',1),
    ('medica','conversando','Em Atendimento',2),
    ('medica','follow_up_1_feito','Reengajamento',3),
    ('medica','follow_up_2_feito','Reengajamento 2',4),
    ('medica','consulta_agendada','Consulta Agendada',5),
    ('medica','follow_up_3_feito','Aguardando Confirmação',6),
    ('medica','consulta_confirmada','Confirmado',7),
    ('medica','consulta_cancelada','Cancelada / Falta',8),
    ('medica','consulta_realizada','Consulta Realizada',9),
    ('medica','orcamento_pendente','Orçamento Pendente',10),
    ('medica','paciente_recorrente','Reagendado',11),
    ('medica','retornar_3_meses','Retorno',12),
    ('medica','retornar_6_meses','Retorno 6 meses',13),
    ('medica','retornar_1_ano','Retorno 1 ano',14),
    ('odontologica','iniciou_conversa','Novo Contato',1),
    ('odontologica','conversando','Orçamento em Negociação',2),
    ('odontologica','follow_up_1_feito','Reengajamento',3),
    ('odontologica','follow_up_2_feito','Reengajamento 2',4),
    ('odontologica','consulta_agendada','Avaliação Agendada',5),
    ('odontologica','follow_up_3_feito','Aguardando Confirmação',6),
    ('odontologica','consulta_confirmada','Confirmado',7),
    ('odontologica','consulta_cancelada','Cancelada / Falta',8),
    ('odontologica','consulta_realizada','Avaliação Realizada',9),
    ('odontologica','orcamento_pendente','Orçamento Pendente',10),
    ('odontologica','paciente_recorrente','Reagendado',11),
    ('odontologica','retornar_3_meses','Retorno',12),
    ('odontologica','retornar_6_meses','Retorno 6 meses',13),
    ('odontologica','retornar_1_ano','Retorno 1 ano',14),
    ('generico','iniciou_conversa','Novo Contato',1),
    ('generico','conversando','Em Conversa',2),
    ('generico','follow_up_1_feito','Reengajamento',3),
    ('generico','follow_up_2_feito','Reengajamento 2',4),
    ('generico','consulta_agendada','Agendado',5),
    ('generico','follow_up_3_feito','Aguardando Confirmação',6),
    ('generico','consulta_confirmada','Confirmado',7),
    ('generico','consulta_cancelada','Cancelada / Falta',8),
    ('generico','consulta_realizada','Concluído',9),
    ('generico','orcamento_pendente','Orçamento Pendente',10),
    ('generico','paciente_recorrente','Reagendado',11),
    ('generico','retornar_3_meses','Retorno',12),
    ('generico','retornar_6_meses','Retorno 6 meses',13),
    ('generico','retornar_1_ano','Retorno 1 ano',14)
  )
  select g.chave, g.rotulo, g.ordem,
         g.chave in ('consulta_realizada','orcamento_pendente','paciente_recorrente','retornar_3_meses','retornar_6_meses','retornar_1_ano'),
         g.chave in ('consulta_realizada','orcamento_pendente','paciente_recorrente','retornar_3_meses','retornar_6_meses','retornar_1_ano')
  from g
  where g.nicho = p_nicho
  order by g.ordem
$$;

-- 6. Clínicas existentes: rótulos renomeados, chaves novas e ordem do gabarito
--    (só troca quem ainda está com o rótulo do gabarito; nome personalizado fica)
update public.funil_etapas
set rotulo = 'Aguardando Confirmação'
where chave = 'follow_up_3_feito'
  and rotulo in ('Confirmação de Consulta', 'Confirmação de Avaliação', 'Confirmação');

update public.funil_etapas
set rotulo = 'Cancelada / Falta'
where chave = 'consulta_cancelada'
  and rotulo in ('Consulta Cancelada', 'Avaliação Cancelada', 'Cancelado');

insert into public.funil_etapas (clinica_id, chave, rotulo, ordem, exige_consulta_realizada, e_paciente, mapeia_para)
select cc.id, g.chave, g.rotulo, g.ordem, g.exige_consulta_realizada, g.e_paciente, null
from public.configuracoes_clinica cc
cross join lateral public.gabarito_funil(cc.nicho) g
where g.chave in ('consulta_confirmada', 'orcamento_pendente')
on conflict (clinica_id, chave) do nothing;

-- A ordem do documento vale para todo mundo: é a mudança pedida (Confirmação
-- antes de Cancelada, Orçamento Pendente depois de Realizada).
update public.funil_etapas fe
set ordem = g.ordem
from public.configuracoes_clinica cc
cross join lateral public.gabarito_funil(cc.nicho) g
where fe.clinica_id = cc.id
  and fe.chave = g.chave
  and fe.ordem <> g.ordem;

-- 7. Quem estava aguardando classificação de retorno passa para Orçamento
--    Pendente (é lá que a classificação de retorno acontece agora).
update public.leads_clinica
set status = 'orcamento_pendente'
where status = 'paciente_recorrente';

-- 8. Consulta realizada → Orçamento Pendente (mesmo gatilho da 016/007)
create or replace function public.marca_lead_recorrente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'realizada'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update public.leads_clinica
    set status = 'orcamento_pendente',
        data_virou_recorrente = new.data_consulta,
        data_prevista_retorno = null
    where id = new.lead_id;
  end if;
  return new;
end;
$$;

-- 9. Sincronização da consulta agendada: listas com as chaves novas + falta
create or replace function public.consulta_sincroniza_agendamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outras int;
begin
  if tg_op in ('INSERT', 'UPDATE')
     and new.status = 'agendada'
     and (tg_op = 'INSERT' or old.status is distinct from 'agendada') then

    update public.leads_clinica
    set status = 'consulta_agendada',
        data_agendamento = new.data_consulta
    where id = new.lead_id
      and status in ('iniciou_conversa', 'conversando', 'follow_up_1_feito',
                     'follow_up_2_feito', 'consulta_cancelada', 'consulta_confirmada');

    update public.leads_clinica
    set data_agendamento = new.data_consulta
    where id = new.lead_id
      and status in ('consulta_agendada', 'consulta_confirmada', 'paciente_recorrente',
                     'retornar_3_meses', 'retornar_6_meses', 'retornar_1_ano');
  end if;

  -- Cancelada, faltou ou apagada, sem outra agendada restante.
  if (tg_op = 'DELETE' and old.status = 'agendada')
     or (tg_op = 'UPDATE' and old.status = 'agendada' and new.status in ('cancelada', 'faltou')) then

    select count(*) into v_outras
    from public.consultas c
    where c.lead_id = old.lead_id
      and c.status = 'agendada'
      and c.id <> old.id;

    if v_outras = 0 then
      update public.leads_clinica
      set status = 'consulta_cancelada',
          data_agendamento = null
      where id = old.lead_id
        and status in ('consulta_agendada', 'follow_up_3_feito', 'consulta_confirmada');

      update public.leads_clinica
      set data_agendamento = null
      where id = old.lead_id
        and status in ('paciente_recorrente', 'retornar_3_meses', 'retornar_6_meses', 'retornar_1_ano');
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- 10. A proteção da última consulta realizada (017) passa a valer para
--     Orçamento Pendente: é lá que fica o lead que acabou de sair da consulta.
create or replace function public.consulta_protege_paciente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_outras int;
begin
  if old.status <> 'realizada' or (tg_op = 'UPDATE' and new.status = 'realizada') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select l.status into v_status from public.leads_clinica l where l.id = old.lead_id;
  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if v_status not in ('orcamento_pendente', 'paciente_recorrente', 'retornar_3_meses',
                      'retornar_6_meses', 'retornar_1_ano') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select count(*) into v_outras
  from public.consultas c
  where c.lead_id = old.lead_id
    and c.status = 'realizada'
    and c.id <> old.id;

  if v_outras = 0 then
    raise exception 'Não é possível remover a última consulta realizada de um paciente. Altere a etapa do lead antes.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

commit;
