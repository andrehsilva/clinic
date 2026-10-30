-- 029: preservar a etapa de leads sob responsabilidade da secretaria.
--
-- O app grava atendimento_manual como flag mestre. Os workflows n8n precisam
-- filtrar atendimento_manual = false antes de enviar mensagens ou atualizar
-- status; eles não estão neste repositório e esta migration não os altera.
-- Aqui, os mecanismos automáticos que estão no banco também deixam de mudar
-- o status enquanto o atendimento_manual estiver ativo.

begin;

-- Consulta realizada: mantém os dados clínicos atualizados, mas não toma a
-- etapa do lead manual para si.
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
    set status = case when atendimento_manual then status else 'orcamento_pendente' end,
        data_virou_recorrente = new.data_consulta,
        data_prevista_retorno = null
    where id = new.lead_id;
  end if;
  return new;
end;
$$;

-- Agendar/cancelar continua sincronizando as datas. Só a troca automática da
-- etapa é suprimida para leads manuais.
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
    set status = case when atendimento_manual then status else 'consulta_agendada' end,
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

  if (tg_op = 'DELETE' and old.status = 'agendada')
     or (tg_op = 'UPDATE' and old.status = 'agendada' and new.status in ('cancelada', 'faltou')) then

    select count(*) into v_outras
    from public.consultas c
    where c.lead_id = old.lead_id
      and c.status = 'agendada'
      and c.id <> old.id;

    if v_outras = 0 then
      update public.leads_clinica
      set status = case when atendimento_manual then status else 'consulta_cancelada' end,
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

-- Mantém o comportamento vigente do job (retorno 30 dias antes), mas ele não
-- tira leads manuais da etapa Retorno. A migration 027 pode desativar o job
-- depois que o fluxo n8n no dia previsto estiver ativo e validado.
create or replace function public.verifica_retornos_proximos()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.leads_clinica
  set status = 'follow_up_1_feito'
  where status in ('retornar_3_meses', 'retornar_6_meses', 'retornar_1_ano')
    and arquivado = false
    and em_tratamento = false
    and atendimento_manual = false
    and data_prevista_retorno is not null
    and data_prevista_retorno <= now() + interval '30 days';
end;
$$;

-- Defesa adicional para writes REST autenticados como service_role (padrão do n8n
-- com Supabase). Não bloqueia mensagens enviadas pelo Chatwoot: os workflows
-- ainda precisam filtrar atendimento_manual antes de chamar a API de mensagens.
create or replace function public.protege_status_lead_manual()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.atendimento_manual
     and new.atendimento_manual
     and old.status is distinct from new.status
     and auth.role() = 'service_role' then
    new.status := old.status;
  end if;
  return new;
end;
$$;

drop trigger if exists a_protege_status_manual_trg on public.leads_clinica;
create trigger a_protege_status_manual_trg
  before update of status on public.leads_clinica
  for each row
  execute function public.protege_status_lead_manual();

revoke all on function public.protege_status_lead_manual() from public, anon, authenticated;

commit;
