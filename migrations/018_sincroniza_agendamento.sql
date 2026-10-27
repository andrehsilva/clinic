-- 018: sincroniza o lead com a consulta agendada registrada no app.
--
-- Ao registrar uma consulta com status 'agendada':
--   - o lead vai para 'consulta_agendada' (Avaliação Agendada), se estiver numa
--     etapa anterior (conversando, follow-ups, cancelada, início);
--   - se o lead já estiver em 'consulta_agendada', atualiza data_agendamento.
--   - data_agendamento recebe a data da consulta, igual ao que o fluxo
--     "Eventos Agenda" do n8n grava. Os follow-ups do bot pulam leads com
--     data_agendamento preenchida.
--
-- Quando a consulta agendada sai de 'agendada' por cancelamento ou exclusão, e
-- não sobra nenhuma outra agendada:
--   - o lead volta para 'consulta_cancelada' e data_agendamento é limpa.
-- Se a consulta virar 'realizada', não mexe aqui: o trigger da migration 006
-- já leva o lead para paciente.
--
-- Não toca em leads em etapas de paciente/retorno nem em etapas automáticas
-- (follow_up_*), exceto follow_up_3_feito no cancelamento.
--
-- Não aplicar sem revisão. Rodar no SQL Editor do Supabase, em uma transação.

begin;

create or replace function public.consulta_sincroniza_agendamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outras int;
begin
  -- Nova consulta agendada (ou troca de status para agendada)
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
      and status = 'consulta_agendada';
  end if;

  -- Consulta agendada que foi cancelada ou apagada
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
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists consulta_sincroniza_agendamento_trg on public.consultas;
create trigger consulta_sincroniza_agendamento_trg
  after insert or update of status, data_consulta or delete on public.consultas
  for each row
  execute function public.consulta_sincroniza_agendamento();

revoke all on function public.consulta_sincroniza_agendamento() from public, anon, authenticated;

commit;
