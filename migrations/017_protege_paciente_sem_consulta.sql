-- 017: um paciente (ou lead em retorno) não pode ficar sem nenhuma consulta realizada.
--
-- Problema: a regra "paciente exige consulta realizada" existia só na tela, e
-- só na hora de ENTRAR na etapa. Ao apagar a última consulta realizada (ou
-- trocar o status dela), o lead continuava como "Paciente Recorrente" sem consulta.
--
-- Esta migration bloqueia, no banco, a remoção (ou troca de status) da última
-- consulta realizada de um lead que está como paciente ou em retorno.
--
-- Não bloqueia:
--   - edições que mantêm o status 'realizada' (observação, valor, data)
--   - exclusão em cascata quando o lead é apagado
--   - leads que não estão como paciente/retorno
--
-- Obs.: a etapa de AGENDAMENTO (consulta_agendada / follow_up_3_feito) NÃO tem
-- trava no banco de propósito. O fluxo "Eventos Agenda" do n8n muda o status
-- direto em leads_clinica sem criar linha em consultas; uma trava aqui quebraria
-- o bot. Essa regra fica só na tela (statusRules.ts).
--
-- Não aplicar sem revisão. Rodar no SQL Editor do Supabase.

begin;

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
  -- Só importa quando uma consulta REALIZADA deixa de ser realizada.
  if old.status <> 'realizada' or (tg_op = 'UPDATE' and new.status = 'realizada') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- Lead sendo apagado em cascata: não bloquear.
  select l.status into v_status from public.leads_clinica l where l.id = old.lead_id;
  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- Só protege quem está como paciente ou em retorno.
  if v_status not in ('paciente_recorrente', 'retornar_3_meses', 'retornar_6_meses', 'retornar_1_ano') then
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

drop trigger if exists consulta_protege_paciente_trg on public.consultas;
create trigger consulta_protege_paciente_trg
  before update or delete on public.consultas
  for each row
  execute function public.consulta_protege_paciente();

revoke all on function public.consulta_protege_paciente() from public, anon, authenticated;

commit;

-- ─── Diagnóstico (rodar separado, só leitura) ──────────────────────────────
-- Leads que já estão como paciente/retorno mas não têm consulta realizada.
-- Estes NÃO são corrigidos pela migration: decidir caso a caso.
--
-- select l.id, l.nome_lead, l.status
-- from public.leads_clinica l
-- where l.status in ('paciente_recorrente', 'retornar_3_meses', 'retornar_6_meses', 'retornar_1_ano')
--   and not exists (
--     select 1 from public.consultas c
--     where c.lead_id = l.id and c.status = 'realizada'
--   );
