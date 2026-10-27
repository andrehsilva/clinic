-- Classificação de retorno para pacientes recorrentes.
-- Ver plan.md em C:\Users\timet\.claude\plans\analise-o-crm-e-sequential-tulip.md
-- (não versionado no repo) para o desenho completo. Resumo:
--
-- 1. Ao marcar uma consulta como 'realizada' (trigger em `consultas`), o lead
--    vira `paciente_recorrente` sozinho — fica numa fila de classificação.
-- 2. Uma pessoa (enfermeira) abre o lead e classifica o retorno em uma de 3
--    opções: retornar_3_meses / retornar_6_meses / retornar_1_ano.
-- 3. Se a classificação não acontecer em até 24h (calculado no frontend a
--    partir de `data_virou_recorrente`), aparece um alerta visual no app —
--    sem infra de notificação externa (o projeto não tem e-mail/push/toast).
-- 4. Um job diário (pg_cron, mesmo padrão de `atualiza_minutos_ultima_mensagem`)
--    devolve o lead pra `follow_up_1_feito` 30 dias antes da data prevista de
--    retorno, pro assistente de IA reagendar.
--
-- Executado via migrations/006_classificacao_retorno.sh (gitignored, contém o
-- token de Management API do Supabase — mesmo padrão do setup_db.sh).

-- ─── 1. Colunas novas em leads_clinica ─────────────────────────────────────
alter table public.leads_clinica
  add column if not exists data_virou_recorrente timestamptz,
  add column if not exists data_prevista_retorno  timestamptz;

-- ─── 2. Constraint de status — adiciona os 3 novos valores ────────────────
alter table public.leads_clinica
  drop constraint if exists leads_clinica_status_check;

alter table public.leads_clinica
  add constraint leads_clinica_status_check
  check (status in (
    'iniciou_conversa','conversando','consulta_agendada',
    'consulta_cancelada','follow_up_1_feito','follow_up_2_feito',
    'follow_up_3_feito','consulta_realizada','paciente_recorrente',
    'retornar_3_meses','retornar_6_meses','retornar_1_ano'
  ));

-- ─── 3. Trigger: consulta realizada → lead vira paciente_recorrente ───────
create or replace function public.marca_lead_recorrente()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.status = 'realizada' then
    update public.leads_clinica
    set status = 'paciente_recorrente',
        data_virou_recorrente = new.data_consulta,
        data_prevista_retorno = null
    where id = new.lead_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_marca_lead_recorrente on public.consultas;

create trigger trg_marca_lead_recorrente
after insert or update of status on public.consultas
for each row
execute function public.marca_lead_recorrente();

-- ─── 4. pg_cron: devolve pro follow-up 30 dias antes do retorno previsto ──
create or replace function public.verifica_retornos_proximos()
returns void
language plpgsql
security definer
as $$
begin
  update public.leads_clinica
  set status = 'follow_up_1_feito'
  where status in ('retornar_3_meses', 'retornar_6_meses', 'retornar_1_ano')
    and data_prevista_retorno is not null
    and data_prevista_retorno <= now() + interval '30 days';
end;
$$;

select cron.schedule(
  'verifica_retornos_proximos',
  '0 12 * * *',
  $$select public.verifica_retornos_proximos();$$
);
