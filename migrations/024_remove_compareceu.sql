-- 024: sai a etapa "Compareceu / Em Atendimento".
--
-- Do "Confirmado" a secretária já vai direto para o desfecho do atendimento:
-- consulta marcada como 'realizada' (o lead cai em Orçamento Pendente) ou
-- arrastar para "Reagendado". Uma etapa intermediária de check-in só pedia um
-- clique a mais.
--
-- A 023 criou a chave compareceu em funil_etapas e nos checks; aqui ela sai
-- inteira: os leads que estavam nela voltam para consulta_confirmada (de onde a
-- secretária escolhe o desfecho), a linha do funil é apagada, a ordem é
-- renumerada 1..14 por clínica e a chave sai dos checks e do gabarito.
--
-- Não aplicar sem revisão. Rodar no SQL Editor do Supabase, em uma transação.

begin;

-- 1. Quem estava em Compareceu volta para Confirmado
update public.leads_clinica
set status = 'consulta_confirmada'
where status = 'compareceu';

-- 2. Apaga a etapa do funil de cada clínica e fecha o buraco de ordem (1..14)
delete from public.funil_etapas where chave = 'compareceu';

with renumeradas as (
  select id, row_number() over (partition by clinica_id order by ordem) as nova
  from public.funil_etapas
)
update public.funil_etapas fe
set ordem = r.nova
from renumeradas r
where r.id = fe.id
  and fe.ordem <> r.nova;

-- 3. Checks sem a chave
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

-- 4. Gabarito com 14 etapas (mesmo conteúdo da 023 sem a chave)
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

-- 5. Sincronização da consulta agendada sem a chave
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

  -- Cancelada, faltou ou apagada, sem outra agendada restante
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

commit;
