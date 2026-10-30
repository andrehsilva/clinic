# n8n_clinic — fluxos n8n do Tem Horário (WhatsApp via WAHA)

Fluxos novos para o app multi-clínica, baseados na análise dos fluxos antigos da pasta `../n8n/` (outro app,
single-tenant, com Chatwoot e Google Calendar). **Nada aqui foi executado ou importado ainda**: os JSONs foram
gerados e validados estruturalmente (conexões, expressões, sintaxe dos nós Code), mas precisam ser importados,
ligados às credenciais e testados com um número de teste antes de ativar.

## O que tem aqui

```
n8n_clinic/
├─ README.md                      (este arquivo)
├─ sql/031_n8n_waha.sql           RPCs de apoio + colunas novas (NÃO aplicada)
├─ workflows/
│  ├─ 01_atendimento_whatsapp.json        webhook WAHA → agente → resposta → CRM
│  ├─ 04_followup_reengajamento.json      follow-up 20 min / 24 h
│  ├─ 05_lembrete_confirmacao_consulta.json
│  ├─ 06_aniversario.json
│  ├─ 07_mensagens_programadas.json
│  └─ 08_retorno_no_dia.json
├─ docs/
│  ├─ contratos.md                RPCs, transições de status, chaves Redis, credenciais
│  └─ prompts.md                  prompts (montados do banco) e decisões
└─ exemplos/waha_mensagem_texto.json    payload para testar o webhook com curl
```

A numeração pula 02 e 03 de propósito: as ferramentas da agenda/humano (antigos 2, 4, 5, 6) viraram **ferramentas
HTTP do próprio agente** que chamam funções do banco, e a extração do CRM (antigo 3) virou o ramo final do fluxo 01.
Menos sub-workflows, nenhum ID de workflow para religar.

## Como funciona

```
WhatsApp ⇄ WAHA ──webhook──▶ [01 Atendimento]
                               ├─ resolve a clínica pela sessão WAHA (n8n_resolver_clinica)
                               ├─ registra o lead (n8n_registrar_mensagem_lead) — pula se atendimento_manual/arquivado
                               ├─ áudio → texto, imagem → descrição, debounce Redis
                               ├─ agente IA (prompt montado do banco) com ferramentas:
                               │    ver_horarios · agendar_consulta · reagendar_consulta ·
                               │    cancelar_consulta · confirmar_presenca · chamar_humano   (→ RPCs)
                               ├─ divide e envia pelo WAHA (digitando… → texto)
                               └─ extrai nome/procedimento/resumo → CRM; avisa a secretaria se virou humano

cron ─▶ [04 follow-up] [05 lembrete] [06 aniversário] [07 campanhas] [08 retorno]
        cada um: RPC decide quem recebe → (IA ou texto pronto) → WAHA → RPC marca no banco
```

Princípios:
- **A agenda é a tabela `consultas`.** O n8n só insere/atualiza/cancela consultas; os triggers do banco
  (018/023/029/030) movem a etapa do lead. Os fluxos antigos escreviam `status` direto (e duplicado).
- **Regras em SQL.** Quem pode receber follow-up/lembrete/retorno é decidido na RPC (clínica, manual, arquivado,
  em tratamento, consulta marcada, janela de horário). O n8n não filtra nada sozinho.
- **Multi-clínica:** tudo carrega `clinica_id`; memória e buffer do Redis usam `clinica_id:telefone`.
- **Atendimento manual é respeitado em todos os fluxos** (a UI do app liga a flag; o bot cala).

## O que mudou em relação aos fluxos antigos

| Antigo (`../n8n/`) | Novo |
|---|---|
| 1 Secretaria IA (Chatwoot, whitelist de teste, Beatriz humana, Gemini+OpenAI) | **01** — WAHA, sem whitelist, assistente virtual, só OpenAI, prompt gerado do banco |
| 2 sobreClinica (subagente com dados fixos no prompt) | dados vêm de `configuracoes_clinica.sobre_clinica` + `servicos_clinica` + `horario_comercial` direto no prompt |
| 3 CRM (força `conversando`, regride lead agendado) | ramo final do **01**; etapa só avança de início/reengajamento/cancelada e nunca de agendado/confirmado/paciente |
| 4 humano_tool (label no Chatwoot, descarta o motivo) | tool `chamar_humano` → `atendimento_manual = true` + motivo na anotação + aviso à secretaria |
| 5/6 Agendamento + Eventos Agenda (Google Calendar/Meet, grava status duplicado) | tools `ver_horarios/agendar/reagendar/cancelar` → só `consultas` |
| 7/8/9 Follow-ups 20 min/24 h/36 h (sem filtro de status/manual; **9 grava `follow_up_2`**; `Wait` sem unidade) | **04** único, 2 passos. O de 36 h **não foi portado** (ver abaixo) |
| — | **05** lembrete/confirmação, **06** aniversário, **07** campanhas, **08** retorno (novos) |

**Por que não há follow-up de 36 h:** no app novo, `follow_up_3_feito` significa **"Aguardando Confirmação"** de uma
consulta já marcada (trava `REQUIRES_CONSULTA_AGENDADA`, trigger de cancelamento, dobra em "Confirmado"). Então os passos 1 e 2 reengajam
leads **sem** consulta, e o "3" virou o lembrete da véspera (fluxo 05).

## Instalação (nesta ordem)

1. **Pré-checks no banco** (cabeçalho do `031`): tipo de `consultas.data_consulta` (esperado `timestamptz`) e de
   `horario_comercial.hora_inicio/hora_fim` (esperado `time`).
2. **Aplicar `sql/031_n8n_waha.sql`** no SQL Editor (staging primeiro). A migration 030 deve estar aplicada
   (sincroniza `data_agendamento` ao reagendar e protege `consulta_realizada`).
3. **Configurar cada clínica** (SQL ou painel):
   ```sql
   update configuracoes_clinica set
     waha_session = 'default',                      -- nome da sessão no WAHA (ou deixe null = dígitos do numero_whatsapp)
     whatsapp_aviso_humano = '5516999990000',       -- WhatsApp da secretaria (opcional)
     sobre_clinica = 'Endereço: ... Pagamento: PIX e cartão. Convênios: não. Avaliação: R$ ... Estacionamento: ...'
   where id = '<clinica_id>';
   ```
   `sobre_clinica`, `whatsapp_aviso_humano`, `waha_session` e `automacao_ativa` ainda **não têm campo no painel**
   (Configuracoes.tsx); por enquanto é SQL. Cadastre também os horários (`horario_comercial`) e procedimentos.
4. **Credenciais no n8n** (nomes em `docs/contratos.md`): Supabase `service_role`, WAHA `X-Api-Key`, Redis, OpenAI.
5. **Importar os 6 JSONs.** Em cada um: abrir o nó **Config** e trocar `supabase_url` e `waha_url`; conferir que
   os nós ficaram ligados às credenciais.
6. **WAHA:** configurar o webhook da sessão para `https://<n8n>/webhook/waha/atendimento` com o evento
   `message` (somente recebidas). Para a detecção de resposta humana pelo celular, usar `message.any`, e
   ligar `detectar_humano` no Config do 01. Definir `WAHA_BASE_URL` (para a URL de mídia sair com o host público) e deixar o download de mídia ligado.
7. **Testar** (abaixo) com um número seu antes de ativar os crons.

## Teste

- Webhook (n8n em modo "Test"):
  `curl -X POST https://<n8n>/webhook-test/waha/atendimento -H "Content-Type: application/json" -d @exemplos/waha_mensagem_texto.json`
  Troque `session` pela sessão da sua clínica. Esperado: lead criado em `leads_clinica`, resposta enviada pelo WAHA, lead com nome/resumo.
- Sem `session` cadastrada: o fluxo para em silêncio (`Clinica` volta vazio).
- Agenda: peça um horário no WhatsApp → conferir a linha em `consultas` e a etapa do lead (`consulta_agendada`) no CRM.
- Humano: escreva "quero falar com uma pessoa" → card com "Atendimento manual" e aviso para `whatsapp_aviso_humano`.
- Crons: execute o fluxo manualmente com 1 lead de teste que satisfaça as regras (ver `docs/contratos.md`). Os crons só devolvem leads dentro da janela de horário (SP).

## Riscos e pontos a validar

1. **WAHA Core suporta uma sessão só.** Várias clínicas exigem WAHA Plus ou um contêiner por clínica (cada um com sua URL: aí `waha_url` por clínica precisaria virar coluna; hoje é uma URL única no Config). O desenho já usa `waha_session` por clínica.
2. **Formato do payload e do `chatId`.** Os campos usados (`payload.from/to/fromMe/body/hasMedia/media.url`, `_data.notifyName`) vêm do WAHA, mas variam com a versão/engine. Se o contato vier como `@lid`, o número de telefone **não** estará no `from`. **Valide com um payload real** e ajuste o nó `Normalizar`. O exemplo em `exemplos/` é aproximado.
3. **Telefone sem DDI/9º dígito.** Comparação por dígitos exatos: "5516991122235" ≠ "551691122235". Normalize ao cadastrar manualmente leads.
4. **Credencial service_role** fica só no n8n. Nunca no front.
5. **Risco de banimento do WhatsApp:** há typing, pausas entre mensagens, intervalo aleatório de 20–60 s entre leads, teto de 20 por rodada e janela de horário. Aquecer o número e não ativar tudo de uma vez.
6. **Fuso/tipos de data:** `n8n_agendar_consulta` grava `data_consulta` como instante correto (SP). O app (`LeadDetail.tsx`, modal de consulta) envia o `datetime-local` **sem fuso**; se a coluna for `timestamptz`, consultas criadas pela secretaria ficam deslocadas 3 h em relação às do bot e o cálculo de conflito erra. Corrigir o front antes de colocar o agendamento do bot em produção.
7. **Sem trava contra execução simultânea** dos crons: o `marcar_*` é condicional ao estado esperado (idempotente), então duplo envio é improvável mas possível se uma rodada demorar mais que o intervalo.
8. **Custos de IA:** o agente roda a cada mensagem agrupada; follow-up e retorno geram 1 mensagem por lead. Modelo padrão `gpt-4.1-mini` (editável nos nós "Modelo").
9. **Ex-pacientes (arquivados) não recebem resposta do bot**: o 01 os trata como atendimento humano (a secretaria vê no app).
10. **Mídia:** só áudio e imagem são interpretados; vídeo/documento sem legenda são ignorados em silêncio.
11. **Código gerado não testado em produção.** Em especial: tipos/versões dos nós de IA mudam entre versões do n8n; se algum nó aparecer com aviso ao importar, ajustar na UI (parâmetros e nomes estão em `docs/contratos.md`).

## Pendências sugeridas (fora desta entrega)
- Campos no painel (`Configuracoes.tsx`) para `sobre_clinica`, `whatsapp_aviso_humano` e `automacao_ativa`.
- `waha_url` por clínica, se houver mais de uma VPS/contêiner de WAHA.
- Aplicar a migration 030 e corrigir o fuso no modal de consulta (item 6).
