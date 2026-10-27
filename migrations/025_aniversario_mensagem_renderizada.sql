-- 025: a mensagem de aniversário sai com as variáveis do tenant já trocadas.
--
-- A 015 devolvia `mensagem_aniversario` cru ({nome}/{clinica}) e quem chamava
-- tinha que substituir. Isso deixou a troca fora do banco, e cada consumidor
-- acaba usando um nome fixo. Agora `aniversariantes_do_dia()` devolve o texto
-- pronto, com:
--   {nome}    -> primeiro nome do cliente
--   {clinica} -> nome da clínica dona do lead
-- Os nomes das colunas são os mesmos de propósito: o workflow do n8n continua
-- funcionando sem alteração (e um replace extra no lado dele não muda nada).
--
-- Espelha renderizarMensagem() em src/lib/aniversario.ts (prévia da tela).
--
-- Não aplicar sem revisão. Rodar no SQL Editor do Supabase, em uma transação.

begin;

create or replace function public.aniversariantes_do_dia()
returns table (
  lead_id uuid,
  nome_lead text,
  whatsapp_lead text,
  id_conta_chatwoot text,
  id_conversa_chatwoot text,
  nome_clinica text,
  mensagem_aniversario text
)
language sql
stable
security definer
set search_path = public
as $$
  select l.id,
         l.nome_lead,
         l.whatsapp_lead,
         l.id_conta_chatwoot,
         l.id_conversa_chatwoot,
         c.nome_clinica,
         replace(
           replace(
             c.mensagem_aniversario,
             '{nome}',
             coalesce(nullif(split_part(btrim(coalesce(l.nome_lead, '')), ' ', 1), ''), 'cliente')
           ),
           '{clinica}',
           coalesce(nullif(btrim(coalesce(c.nome_clinica, '')), ''), 'nossa clínica')
         ) as mensagem_aniversario
  from public.leads_clinica l
  join public.configuracoes_clinica c on c.id = l.clinica_id
  where c.aniversario_ativo
    and not l.arquivado
    and l.data_nascimento is not null
    and to_char(l.data_nascimento, 'MM-DD') = to_char((now() at time zone 'America/Sao_Paulo')::date, 'MM-DD')
    and (
      l.ultimo_aniversario_enviado is null
      or extract(year from l.ultimo_aniversario_enviado)
         < extract(year from (now() at time zone 'America/Sao_Paulo')::date)
    )
$$;

commit;
