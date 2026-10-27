-- 021: sai a etapa "Contato Manual" e o lead novo passa a nascer em
-- "Novo Contato" (ou em "Avaliação Agendada", quando já vem com a data da
-- consulta).
--
-- contato_manual_feito nasceu na 020 e nenhum fluxo externo (n8n/Chatwoot)
-- grava nela, então a chave sai inteira: os leads que estavam nela são
-- reaproveitados, a linha de funil_etapas é apagada e a chave sai dos checks.
--
-- Não aplicar sem revisão. Rodar no SQL Editor do Supabase, em uma transação.

begin;

-- 1. Reaproveita os leads que estavam em Contato Manual:
--    quem já tem consulta agendada (data ou linha em consultas) vai para
--    consulta_agendada; o resto volta para início, como qualquer lead novo.
update public.leads_clinica lc
set status = case
      when lc.data_agendamento is not null
        or exists (
          select 1 from public.consultas c
          where c.lead_id = lc.id and c.status = 'agendada'
        )
      then 'consulta_agendada'
      else 'iniciou_conversa'
    end
where lc.status = 'contato_manual_feito';

-- 2. Apaga a etapa do funil de cada clínica
delete from public.funil_etapas where chave = 'contato_manual_feito';

-- Fecha o buraco de ordem que a etapa apagada deixou (1..12 por clínica).
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
    'consulta_agendada','follow_up_3_feito','consulta_cancelada',
    'consulta_realizada','paciente_recorrente',
    'retornar_3_meses','retornar_6_meses','retornar_1_ano'
  ));

alter table public.funil_etapas
  drop constraint if exists funil_etapas_chave_check;
alter table public.funil_etapas
  add constraint funil_etapas_chave_check check (chave in (
    'iniciou_conversa','conversando','follow_up_1_feito','follow_up_2_feito',
    'consulta_agendada','follow_up_3_feito','consulta_cancelada',
    'consulta_realizada','paciente_recorrente',
    'retornar_3_meses','retornar_6_meses','retornar_1_ano'
  ));

alter table public.funil_etapas
  drop constraint if exists funil_etapas_mapeia_para_check;
alter table public.funil_etapas
  add constraint funil_etapas_mapeia_para_check check (
    mapeia_para is null
    or (mapeia_para in (
      'iniciou_conversa','conversando','follow_up_1_feito','follow_up_2_feito',
      'consulta_agendada','follow_up_3_feito','consulta_cancelada',
      'consulta_realizada','paciente_recorrente',
      'retornar_3_meses','retornar_6_meses','retornar_1_ano'
    ) and mapeia_para <> chave)
  );

-- 4. Gabarito sem a etapa (ordens 1..12, sem buraco)
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
    ('estetica','follow_up_3_feito','Confirmação de Consulta',6),
    ('estetica','consulta_cancelada','Consulta Cancelada',7),
    ('estetica','consulta_realizada','Consulta Realizada',8),
    ('estetica','paciente_recorrente','Paciente Recorrente',9),
    ('estetica','retornar_3_meses','Retorno',10),
    ('estetica','retornar_6_meses','Retorno 6 meses',11),
    ('estetica','retornar_1_ano','Retorno 1 ano',12),
    ('medica','iniciou_conversa','Novo Contato',1),
    ('medica','conversando','Em Atendimento',2),
    ('medica','follow_up_1_feito','Reengajamento',3),
    ('medica','follow_up_2_feito','Reengajamento 2',4),
    ('medica','consulta_agendada','Consulta Agendada',5),
    ('medica','follow_up_3_feito','Confirmação de Consulta',6),
    ('medica','consulta_cancelada','Consulta Cancelada',7),
    ('medica','consulta_realizada','Consulta Realizada',8),
    ('medica','paciente_recorrente','Paciente Recorrente',9),
    ('medica','retornar_3_meses','Retorno',10),
    ('medica','retornar_6_meses','Retorno 6 meses',11),
    ('medica','retornar_1_ano','Retorno 1 ano',12),
    ('odontologica','iniciou_conversa','Novo Contato',1),
    ('odontologica','conversando','Orçamento em Negociação',2),
    ('odontologica','follow_up_1_feito','Reengajamento',3),
    ('odontologica','follow_up_2_feito','Reengajamento 2',4),
    ('odontologica','consulta_agendada','Avaliação Agendada',5),
    ('odontologica','follow_up_3_feito','Confirmação de Avaliação',6),
    ('odontologica','consulta_cancelada','Avaliação Cancelada',7),
    ('odontologica','consulta_realizada','Avaliação Realizada',8),
    ('odontologica','paciente_recorrente','Paciente Ativo',9),
    ('odontologica','retornar_3_meses','Retorno',10),
    ('odontologica','retornar_6_meses','Retorno 6 meses',11),
    ('odontologica','retornar_1_ano','Retorno 1 ano',12),
    ('generico','iniciou_conversa','Novo Contato',1),
    ('generico','conversando','Em Conversa',2),
    ('generico','follow_up_1_feito','Reengajamento',3),
    ('generico','follow_up_2_feito','Reengajamento 2',4),
    ('generico','consulta_agendada','Agendado',5),
    ('generico','follow_up_3_feito','Confirmação',6),
    ('generico','consulta_cancelada','Cancelado',7),
    ('generico','consulta_realizada','Concluído',8),
    ('generico','paciente_recorrente','Cliente Recorrente',9),
    ('generico','retornar_3_meses','Retorno',10),
    ('generico','retornar_6_meses','Retorno 6 meses',11),
    ('generico','retornar_1_ano','Retorno 1 ano',12)
  )
  select g.chave, g.rotulo, g.ordem,
         g.chave in ('consulta_realizada','paciente_recorrente','retornar_3_meses','retornar_6_meses','retornar_1_ano'),
         g.chave in ('consulta_realizada','paciente_recorrente','retornar_3_meses','retornar_6_meses','retornar_1_ano')
  from g
  where g.nicho = p_nicho
  order by g.ordem
$$;

-- 5. aplicar_nicho e seed sem a etapa
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

-- 6. Consulta agendada volta a tirar o lead das etapas anteriores (sem Contato Manual)
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
                     'follow_up_2_feito', 'consulta_cancelada');

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

-- 7. Etapa inicial do lead criado
--    Sem data de consulta: "Novo Contato" (iniciou_conversa, o default da coluna).
--    Com data de consulta: "Avaliação Agendada" (consulta_agendada).
--    Status enviado explicitamente pelo integrador é respeitado quando não há data.
create or replace function public.leads_clinica_status_inicial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.data_agendamento is not null then
    new.status := 'consulta_agendada';
  elsif new.status is null then
    new.status := 'iniciou_conversa';
  end if;
  return new;
end;
$$;

drop trigger if exists leads_clinica_status_inicial_trg on public.leads_clinica;
create trigger leads_clinica_status_inicial_trg
  before insert on public.leads_clinica
  for each row
  execute function public.leads_clinica_status_inicial();

revoke all on function public.leads_clinica_status_inicial() from public, anon;

commit;
