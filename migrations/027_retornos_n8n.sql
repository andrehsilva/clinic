-- 027: transfere a movimentação por data de retorno do pg_cron para o n8n.
--
-- A função verifica_retornos_proximos (migrations 006/007/019) move leads
-- de retornar_* para follow_up_1_feito até 30 dias ANTES da data prevista.
-- O novo fluxo n8n, por outro lado, monitora retornar_* e move para
-- conversando no dia previsto. Os dois mecanismos competem: o pg_cron tira
-- o lead da etapa Retorno antes que o n8n chegue à data.
--
-- Pré-requisito: ativar e testar o fluxo n8n que seleciona os status
-- retornar_3_meses, retornar_6_meses e retornar_1_ano e, na data prevista,
-- atualiza status para 'conversando'. Só então rodar esta migration no SQL
-- Editor do Supabase. Ela remove os jobs agendados; não apaga a função SQL.
--
-- Rollback: recriar o job pg_cron de verifica_retornos_proximos conforme
-- migration 019 (job diário ao meio-dia UTC).

begin;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'verifica_retornos_proximos'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$$;

commit;
