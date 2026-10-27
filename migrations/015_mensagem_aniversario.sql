-- 015: mensagem automática de aniversário.
--
-- O painel grava a flag e o texto em configuracoes_clinica. O n8n chama
-- aniversariantes_do_dia() todo dia, envia pelo Chatwoot e marca o envio com
-- marcar_aniversario_enviado(). As funções só podem ser executadas pelo
-- service_role (n8n), não por usuários do app.
--
-- Não aplicar sem revisão. Rodar no SQL Editor do Supabase, em uma transação.

begin;

-- ─── 1. Configuração na clínica ────────────────────────────────────────────
alter table public.configuracoes_clinica
  add column if not exists aniversario_ativo boolean not null default false,
  add column if not exists mensagem_aniversario text not null default
    'Olá {nome}! Hoje é um dia especial e a equipe da {clinica} deseja um feliz aniversário! 🎂 Que seu ano seja cheio de saúde e alegria. Conte sempre com a gente!';

-- ─── 2. Controle de envio por lead ─────────────────────────────────────────
alter table public.leads_clinica
  add column if not exists ultimo_aniversario_enviado date;

-- ─── 3. Aniversariantes de hoje (horário de São Paulo) ─────────────────────
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
  select l.id, l.nome_lead, l.whatsapp_lead, l.id_conta_chatwoot, l.id_conversa_chatwoot,
         c.nome_clinica, c.mensagem_aniversario
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

-- ─── 4. Marca que a mensagem deste ano já foi enviada ──────────────────────
create or replace function public.marcar_aniversario_enviado(p_lead uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.leads_clinica
  set ultimo_aniversario_enviado = (now() at time zone 'America/Sao_Paulo')::date
  where id = p_lead
$$;

-- ─── 5. Só o n8n (service_role) executa ────────────────────────────────────
revoke all on function public.aniversariantes_do_dia() from public, anon, authenticated;
revoke all on function public.marcar_aniversario_enviado(uuid) from public, anon, authenticated;
grant execute on function public.aniversariantes_do_dia() to service_role;
grant execute on function public.marcar_aniversario_enviado(uuid) to service_role;

commit;
