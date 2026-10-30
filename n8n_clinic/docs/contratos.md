# Contratos: RPCs, status e chaves

Tudo que os fluxos escrevem no banco passa por funções `n8n_*` (arquivo `sql/031_n8n_waha.sql`), executáveis
**somente** pelo `service_role`. Os fluxos não fazem `UPDATE` direto em `leads_clinica.status`, exceto pelas
transições listadas abaixo, que estão dentro dessas funções.

## RPCs

| Função | Usada em | Entrada | Saída / efeito |
|---|---|---|---|
| `n8n_resolver_clinica(p_session)` | 01 | sessão WAHA | JSON da clínica: `clinica_id`, `nome_clinica`, `nicho`, `sobre_clinica`, `servicos[]`, `horarios[]`, `whatsapp_aviso_humano`, `automacao_ativa`. `null` se a sessão não for de nenhuma clínica (o fluxo para) |
| `n8n_registrar_mensagem_lead(p_clinica, p_telefone, p_nome)` | 01 | clínica, telefone, nome do WhatsApp | Cria o lead (`iniciou_conversa`) ou atualiza `ultima_mensagem`; devolve `lead_id`, `status`, `atendimento_manual`, `arquivado`, `data_agendamento`… |
| `n8n_atualizar_crm(p_lead, p_nome, p_procedimento, p_resumo)` | 01 | extração da IA | Só preenche o que veio não vazio (`nome_lead`, `procedimento_interesse`, `resumo_conversa`) |
| `n8n_ver_horarios(p_clinica, p_dias, p_duracao)` | tool `ver_horarios` | dias (máx. 21) | `[{data, dia_semana, horarios[]}]` a partir de `horario_comercial` menos `consultas` agendadas (SP, antecedência mínima 1 h, 30 min por consulta) |
| `n8n_agendar_consulta(...)` | tool `agendar_consulta` | `p_data_hora` = `AAAA-MM-DD HH:MM` (SP) | `INSERT` em `consultas` (`agendada`). Erros: `lead_nao_encontrado`, `data_invalida`, `ja_agendado`, `passado`, `fora_horario`, `ocupado`. **A etapa do lead é movida pelo trigger do banco** |
| `n8n_reagendar_consulta(...)` | tool `reagendar_consulta` | nova data/hora | `UPDATE consultas.data_consulta` da consulta agendada (a migration 030 sincroniza `data_agendamento`) |
| `n8n_cancelar_consulta(...)` | tool `cancelar_consulta` | — | consulta agendada → `cancelada` (trigger move o lead para `consulta_cancelada`) |
| `n8n_confirmar_consulta(...)` | tool `confirmar_presenca` | — | lead `consulta_agendada`/`follow_up_3_feito` → `consulta_confirmada` (ignora atendimento manual) |
| `n8n_chamar_humano(p_clinica, p_telefone, p_motivo)` | tool `chamar_humano`, ramo "celular" | motivo | `atendimento_manual = true` + anotação `iso\|[Atendimento] motivo` (mesmo formato do `LeadDetail`) |
| `n8n_followup_elegiveis()` / `n8n_marcar_followup(lead, passo)` | 04 | — | ver regras abaixo |
| `n8n_lembretes_consulta()` / `n8n_marcar_lembrete(lead)` | 05 | — | consultas de amanhã; `consulta_agendada` → `follow_up_3_feito` |
| `n8n_retornos_do_dia()` / `n8n_marcar_retorno(lead)` | 08 | — | `retornar_*` vencido → `conversando` |
| `n8n_aniversariantes_do_dia()` + `marcar_aniversario_enviado(lead)` | 06 | — | usa a 025; devolve `waha_session` |
| `n8n_mensagens_programadas_do_dia()` + `marcar_mensagem_programada_enviada(campanha, lead)` | 07 | — | usa a 026; devolve `waha_session` |

## Transições de status que os fluxos podem fazer

| De | Para | Quem | Condição |
|---|---|---|---|
| (novo) | `iniciou_conversa` | 01 `registrar_mensagem_lead` | primeiro contato |
| `iniciou_conversa`, `follow_up_1/2_feito`, `consulta_cancelada` | `conversando` | 01 | lead escreveu e `atendimento_manual = false` |
| `iniciou_conversa`, `conversando` | `follow_up_1_feito` | 04 passo 1 | sem resposta 20 min–12 h, sem consulta marcada |
| `follow_up_1_feito` | `follow_up_2_feito` | 04 passo 2 | sem resposta 24–48 h |
| `consulta_agendada` | `follow_up_3_feito` | 05 | consulta amanhã, aguardando confirmação |
| `consulta_agendada`, `follow_up_3_feito` | `consulta_confirmada` | tool `confirmar_presenca` | paciente confirmou |
| `retornar_3_meses/6_meses/1_ano` | `conversando` | 08 | `data_prevista_retorno` vencida |
| qualquer | `consulta_agendada` / `consulta_cancelada` | **triggers do banco** | ao inserir/cancelar em `consultas` (não é escrito pelo n8n) |
| qualquer | `orcamento_pendente` | **trigger do banco** | consulta marcada como `realizada` pela secretaria no app |

Nunca tocados pelos fluxos: `consulta_realizada`, `orcamento_pendente`, `paciente_recorrente`, pacientes em
tratamento (`em_tratamento`), arquivados e leads em `atendimento_manual`.

### Regras de elegibilidade (follow-up, lembrete, retorno)
Em SQL, não no n8n. Todos exigem: `configuracoes_clinica.automacao_ativa`, `atendimento_manual = false`,
`arquivado = false`, número de WhatsApp preenchido. Follow-up exige ainda `em_tratamento = false` e
`data_agendamento is null`. Janelas de envio (SP): follow-up 8h–20h59, lembrete/retorno/aniversário/campanha 9h–18h59.
O follow-up tem **teto de idade** (12 h / 48 h desde a última mensagem) para não disparar para leads antigos quando
os fluxos entrarem no ar.

## Chaves no Redis
| Chave | Uso | TTL |
|---|---|---|
| `buf:<clinica_id>:<telefone>` | debounce de mensagens em sequência | apagada ao processar |
| `bot_msg:<id_da_mensagem>` | marca "esta mensagem foi enviada pelo bot" (detecção de resposta humana) | 180 s |
| memória do agente `<clinica_id>:<telefone>` | histórico da conversa (compartilhado entre 01, 04 e 08) | 7 dias |

## Credenciais (nomes sugeridos; o JSON referencia por nome)
| Nome | Tipo | Observação |
|---|---|---|
| `Supabase (service_role)` | Supabase API | host do projeto + **service role key**. Nunca a anon key |
| `WAHA X-Api-Key` | Header Auth | header `X-Api-Key` = chave do WAHA |
| `Redis` | Redis | o mesmo do EasyPanel/VPS |
| `OpenAI` | OpenAI API | modelos `gpt-4.1-mini`, `gpt-4o-mini` e transcrição de áudio |

## Config (nó "Config" no início de cada workflow)
`supabase_url` e `waha_url` são **constantes editáveis** em cada fluxo (o `$env` costuma estar bloqueado nos
nós do n8n recente). No fluxo 01 há também `detectar_humano` (padrão `false`) e `debounce_segundos` (padrão 6).
