-- 020: uma etapa única de reengajamento, uma etapa manual da secretária e
-- uma etapa única de retorno.
--
-- follow_up_1_feito passa a se chamar "Reengajamento" e follow_up_2_feito é
-- DOBRADA nela (coluna funil_etapas.mapeia_para): a chave continua válida
-- porque o fluxo n8n grava nela, mas não existe mais coluna própria.
-- contato_manual_feito é etapa nova, escolhida pela secretária.
-- retornar_6_meses e retornar_1_ano são dobradas em retornar_3_meses, que vira
-- a coluna "Retorno": a classificação continua gravando a chave dos meses e a
-- IA lê essa chave (a tag), só a exibição deixa de ter três colunas.
--
-- Não aplicar sem revisão. Rodar no SQL Editor do Supabase, em uma transação.

begin;

-- 1. Nova chave no enum de status do lead
alter table public.leads_clinica
  drop constraint if exists leads_clinica_status_check;
alter table public.leads_clinica
  add constraint leads_clinica_status_check
  check (status in (
    'iniciou_conversa','conversando','follow_up_1_feito','contato_manual_feito',
    'follow_up_2_feito','consulta_agendada','follow_up_3_feito','consulta_cancelada',
    'consulta_realizada','paciente_recorrente',
    'retornar_3_meses','retornar_6_meses','retornar_1_ano'
  ));

-- 2. funil_etapas: coluna de dobra + chave nova nos checks
alter table public.funil_etapas
  add column if not exists mapeia_para text;

alter table public.funil_etapas
  drop constraint if exists funil_etapas_chave_check;
alter table public.funil_etapas
  add constraint funil_etapas_chave_check check (chave in (
    'iniciou_conversa','conversando','follow_up_1_feito','contato_manual_feito',
    'follow_up_2_feito','consulta_agendada','follow_up_3_feito','consulta_cancelada',
    'consulta_realizada','paciente_recorrente',
    'retornar_3_meses','retornar_6_meses','retornar_1_ano'
  ));

alter table public.funil_etapas
  drop constraint if exists funil_etapas_mapeia_para_check;
alter table public.funil_etapas
  add constraint funil_etapas_mapeia_para_check check (
    mapeia_para is null
    or (mapeia_para in (
      'iniciou_conversa','conversando','follow_up_1_feito','contato_manual_feito',
      'follow_up_2_feito','consulta_agendada','follow_up_3_feito','consulta_cancelada',
      'consulta_realizada','paciente_recorrente',
      'retornar_3_meses','retornar_6_meses','retornar_1_ano'
    ) and mapeia_para <> chave)
  );

-- 3. Gabarito: rótulos/ordem novos + linha contato_manual_feito
--    (mesma assinatura de retorno da 013, por isso create or replace serve)
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
    ('estetica','contato_manual_feito','Contato Manual',4),
    ('estetica','follow_up_2_feito','Reengajamento 2',5),
    ('estetica','consulta_agendada','Consulta Agendada',6),
    ('estetica','follow_up_3_feito','Confirmação de Consulta',7),
    ('estetica','consulta_cancelada','Consulta Cancelada',8),
    ('estetica','consulta_realizada','Consulta Realizada',9),
    ('estetica','paciente_recorrente','Paciente Recorrente',10),
    ('estetica','retornar_3_meses','Retorno',11),
    ('estetica','retornar_6_meses','Retorno 6 meses',12),
    ('estetica','retornar_1_ano','Retorno 1 ano',13),
    ('medica','iniciou_conversa','Novo Contato',1),
    ('medica','conversando','Em Atendimento',2),
    ('medica','follow_up_1_feito','Reengajamento',3),
    ('medica','contato_manual_feito','Contato Manual',4),
    ('medica','follow_up_2_feito','Reengajamento 2',5),
    ('medica','consulta_agendada','Consulta Agendada',6),
    ('medica','follow_up_3_feito','Confirmação de Consulta',7),
    ('medica','consulta_cancelada','Consulta Cancelada',8),
    ('medica','consulta_realizada','Consulta Realizada',9),
    ('medica','paciente_recorrente','Paciente Recorrente',10),
    ('medica','retornar_3_meses','Retorno',11),
    ('medica','retornar_6_meses','Retorno 6 meses',12),
    ('medica','retornar_1_ano','Retorno 1 ano',13),
    ('odontologica','iniciou_conversa','Novo Contato',1),
    ('odontologica','conversando','Orçamento em Negociação',2),
    ('odontologica','follow_up_1_feito','Reengajamento',3),
    ('odontologica','contato_manual_feito','Contato Manual',4),
    ('odontologica','follow_up_2_feito','Reengajamento 2',5),
    ('odontologica','consulta_agendada','Avaliação Agendada',6),
    ('odontologica','follow_up_3_feito','Confirmação de Avaliação',7),
    ('odontologica','consulta_cancelada','Avaliação Cancelada',8),
    ('odontologica','consulta_realizada','Avaliação Realizada',9),
    ('odontologica','paciente_recorrente','Paciente Ativo',10),
    ('odontologica','retornar_3_meses','Retorno',11),
    ('odontologica','retornar_6_meses','Retorno 6 meses',12),
    ('odontologica','retornar_1_ano','Retorno 1 ano',13),
    ('generico','iniciou_conversa','Novo Contato',1),
    ('generico','conversando','Em Conversa',2),
    ('generico','follow_up_1_feito','Reengajamento',3),
    ('generico','contato_manual_feito','Contato Manual',4),
    ('generico','follow_up_2_feito','Reengajamento 2',5),
    ('generico','consulta_agendada','Agendado',6),
    ('generico','follow_up_3_feito','Confirmação',7),
    ('generico','consulta_cancelada','Cancelado',8),
    ('generico','consulta_realizada','Concluído',9),
    ('generico','paciente_recorrente','Cliente Recorrente',10),
    ('generico','retornar_3_meses','Retorno',11),
    ('generico','retornar_6_meses','Retorno 6 meses',12),
    ('generico','retornar_1_ano','Retorno 1 ano',13)
  )
  select g.chave, g.rotulo, g.ordem,
         g.chave in ('consulta_realizada','paciente_recorrente','retornar_3_meses','retornar_6_meses','retornar_1_ano'),
         g.chave in ('consulta_realizada','paciente_recorrente','retornar_3_meses','retornar_6_meses','retornar_1_ano')
  from g
  where g.nicho = p_nicho
  order by g.ordem
$$;

-- 4. aplicar_nicho e seed passam a gravar a dobra padrão
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

  insert into public.funil_etapas (clinica_id, chave, rotulo, ordem, exige_consulta_realizada, e_paciente, mapeia_para)
  select p_clinica, g.chave, g.rotulo, g.ordem, g.exige_consulta_realizada, g.e_paciente,
         case g.chave
           when 'follow_up_2_feito' then 'follow_up_1_feito'
           when 'retornar_6_meses' then 'retornar_3_meses'
           when 'retornar_1_ano' then 'retornar_3_meses'
         end
  from public.gabarito_funil(p_nicho) g
  on conflict (clinica_id, chave) do update
    set rotulo = case when p_sobrescrever then excluded.rotulo else public.funil_etapas.rotulo end,
        ordem  = case when p_sobrescrever then excluded.ordem  else public.funil_etapas.ordem  end,
        exige_consulta_realizada = excluded.exige_consulta_realizada,
        e_paciente               = excluded.e_paciente,
        mapeia_para              = excluded.mapeia_para;
end;
$$;

create or replace function public.configuracoes_clinica_seed_funil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.funil_etapas (clinica_id, chave, rotulo, ordem, exige_consulta_realizada, e_paciente, mapeia_para)
  select new.id, g.chave, g.rotulo, g.ordem, g.exige_consulta_realizada, g.e_paciente,
         case g.chave
           when 'follow_up_2_feito' then 'follow_up_1_feito'
           when 'retornar_6_meses' then 'retornar_3_meses'
           when 'retornar_1_ano' then 'retornar_3_meses'
         end
  from public.gabarito_funil(new.nicho) g
  on conflict (clinica_id, chave) do nothing;
  return new;
end;
$$;

-- 5. Backfill das clínicas existentes: abre espaço, cria a etapa nova, dobra a 2
--    (só para quem ainda não tem a etapa nova, para rodar de novo sem deslocar a ordem)
update public.funil_etapas fe
set ordem = fe.ordem + 1
from public.funil_etapas fu1
where fu1.clinica_id = fe.clinica_id
  and fu1.chave = 'follow_up_1_feito'
  and fe.ordem > fu1.ordem
  and not exists (
    select 1 from public.funil_etapas cm
    where cm.clinica_id = fe.clinica_id
      and cm.chave = 'contato_manual_feito'
  );

insert into public.funil_etapas (clinica_id, chave, rotulo, ordem, exige_consulta_realizada, e_paciente, mapeia_para)
select fu1.clinica_id, 'contato_manual_feito', 'Contato Manual', fu1.ordem + 1, false, false, null
from public.funil_etapas fu1
where fu1.chave = 'follow_up_1_feito'
on conflict (clinica_id, chave) do nothing;

update public.funil_etapas
set mapeia_para = 'follow_up_1_feito'
where chave = 'follow_up_2_feito';

update public.funil_etapas
set mapeia_para = 'retornar_3_meses'
where chave in ('retornar_6_meses', 'retornar_1_ano');

-- A coluna de retorno passa a ser uma só.
update public.funil_etapas
set rotulo = 'Retorno'
where chave = 'retornar_3_meses'
  and rotulo in ('Retornar em 3 meses', 'Retorno em 3 meses');

-- Só renomeia quem ainda está com o rótulo antigo do gabarito.
update public.funil_etapas
set rotulo = 'Reengajamento'
where chave = 'follow_up_1_feito'
  and rotulo in ('Reengajamento 1', 'Contato 1');

-- 6. Consulta agendada também tira o lead de "Contato Manual"
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
                     'follow_up_2_feito', 'contato_manual_feito', 'consulta_cancelada');

    update public.leads_clinica
    set data_agendamento = new.data_consulta
    where id = new.lead_id
      and status in ('consulta_agendada', 'paciente_recorrente',
                     'retornar_3_meses', 'retornar_6_meses', 'retornar_1_ano');
  end if;

  if (tg_op = 'DELETE' and old.status = 'agendada')
     or (tg_op = 'UPDATE' and old.status = 'agendada' and new.status = 'cancelada') then

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
        and status in ('consulta_agendada', 'follow_up_3_feito');

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
