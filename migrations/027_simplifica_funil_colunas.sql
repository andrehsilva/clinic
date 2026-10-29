-- 027: simplifica o board: menos colunas visíveis, zero mudança no banco.
--
-- O funil tinha 13 colunas e era confuso de arrastar (etapa automática no meio
-- do caminho, três colunas de retorno, "Avaliação Realizada" quase sempre vazia
-- porque o trigger da 023 pula direto para Orçamento Pendente).
--
-- Solução: DOBRAS (funil_etapas.mapeia_para) — a chave técnica de cada etapa
-- continua valendo no banco (o bot/n8n grava e lê as MESMAS chaves, os
-- triggers não mudam); o que muda é só onde o lead APARECE no board, resolvendo
-- por: src/lib/funil.ts (resolverFunil/statusExibido).
--
-- ─── Novas dobras (visível após: colunas de 13 → 8) ──────────────────────────
--  1. Reengajamento 2         → Reengajamento        (fold que o gabarito já previa)
--  2. Aguardando Confirmação  → Confirmado           (lead à espera do "sim" aparece em Confirmado; o selo da etapa revela o estado exato)
--  3. Avaliação Realizada     → Orçamento Pendente   (etapa manual fora do fluxo: o trigger da 023 leva a consulta realizada direto para Orçamento Pendente)
--  4. Retorno 6 Meses         → Retorno              (uma coluna só de retorno; data_prevista_retorno diferencia, e a classificação de retorno reengaja)
--  5. Retorno 1 Ano           → Retorno              (mesmo motivo do item anterior)
--
-- Certas etapas mantêm exatamente TODAS as regras que você tem: trava de
-- consulta registrada para entrar em etapa de paciente, etapas automáticas só
-- pelo bot, alerta de 24h de classificação, alerta de 48h parado — tudo porque
-- as regras seguem a CHAVE, não a coluna (funil.ts:197-198).
--
-- Reversível na UI: em AdminClínicas → Funil, cada etapa dobrada tem o botão
-- "Exibir como coluna". Ou manualmente: update funil_etapas set mapeia_para = null.
--
-- Não aplicar sem revisão. Rodar no SQL Editor do Supabase, em uma transação.

begin;

update public.funil_etapas
set mapeia_para = case chave
  when 'follow_up_2_feito'  then 'follow_up_1_feito'
  when 'follow_up_3_feito'  then 'consulta_confirmada'
  when 'consulta_realizada' then 'orcamento_pendente'
  when 'retornar_6_meses'   then 'retornar_3_meses'
  when 'retornar_1_ano'     then 'retornar_3_meses'
end
where chave in (
  'follow_up_2_feito', 'follow_up_3_feito', 'consulta_realizada',
  'retornar_6_meses', 'retornar_1_ano'
);

commit;
