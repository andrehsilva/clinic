-- Sinalização de que um humano assumiu a conversa com o lead, para o fluxo
-- n8n eventualmente checar antes de continuar mandando mensagens automáticas
-- da IA. A lógica de pausar a IA de fato fica a cargo de quem mantém o fluxo
-- n8n (fora deste repositório) — aqui só preparamos o campo + a UI de toggle.

alter table public.leads_clinica
  add column if not exists atendimento_manual boolean not null default false;
