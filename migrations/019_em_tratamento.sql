-- 019: paciente em tratamento contínuo.
--
-- Campo em_tratamento (separado do status). Enquanto estiver ligado:
--   - o job de retorno (verifica_retornos_proximos) não mexe no lead;
--   - a fila de classificação de retorno não mostra alerta (a tela cuida disso);
--   - uma nova consulta agendada atualiza data_agendamento, sem mudar a etapa,
--     para o bot saber que o paciente tem consulta marcada.
--
-- Ao desligar o campo, o lead entra na fila de classificação na hora (a tela
-- calcula o atraso a partir de data_virou_recorrente, então nada é preciso aqui).
--
-- Não aplicar sem revisão. Rodar no SQL Editor do Supabase, em uma transação.

begin;

-- 1. Campo
alter table public.leads_clinica
  add column if not exists em_tratamento boolean not null default false;

-- 2. Job de retorno ignora quem está em tratamento
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
    and not em_tratamento
    and data_prevista_retorno is not null
    and data_prevista_retorno <= now() + interval '30 days';
end;
$$;

-- 3. Sincronização da consulta agendada (018) também para pacientes
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

    -- Lead em etapa anterior: vai para Avaliação Agendada
    update public.leads_clinica
    set status = 'consulta_agendada',
        data_agendamento = new.data_consulta
    where id = new.lead_id
      and status in ('iniciou_conversa', 'conversando', 'follow_up_1_feito',
                     'follow_up_2_feito', 'consulta_cancelada');

    -- Lead já agendado ou paciente (inclui quem está em tratamento): só atualiza a data
    update public.leads_clinica
    set data_agendamento = new.data_consulta
    where id = new.lead_id
      and status in ('consulta_agendada', 'paciente_recorrente',
                     'retornar_3_meses', 'retornar_6_meses', 'retornar_1_ano');
  end if;

  -- Consulta agendada cancelada ou apagada, sem outra agendada restante
  if (tg_op = 'DELETE' and old.status = 'agendada')
     or (tg_op = 'UPDATE' and old.status = 'agendada' and new.status = 'cancelada') then

    select count(*) into v_outras
    from public.consultas c
    where c.lead_id = old.lead_id
      and c.status = 'agendada'
      and c.id <> old.id;

    if v_outras = 0 then
      -- Quem estava agendado volta para cancelada (sem mexer em paciente/retorno)
      update public.leads_clinica
      set status = 'consulta_cancelada',
          data_agendamento = null
      where id = old.lead_id
        and status in ('consulta_agendada', 'follow_up_3_feito');

      -- Paciente/retorno: só limpa a data
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
