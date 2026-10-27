-- 026: mensagens programadas — texto avulso enviado a todos os clientes num dia
-- escolhido pela clínica (Natal, Ano Novo, promoção, etc.).
--
-- Mesma estrutura da mensagem de aniversário (015/025):
--   * o painel grava a campanha em mensagens_programadas (por clínica);
--   * o n8n chama mensagens_programadas_do_dia() todo dia, envia pelo Chatwoot e
--     marca com marcar_mensagem_programada_enviada();
--   * as funções só podem ser executadas pelo service_role (n8n).
--
-- Diferenças em relação ao aniversário:
--   * a data é escolhida pela clínica (dia + mês), não vem do cadastro do lead;
--   * `ano` null = repete todo ano (Natal); `ano` preenchido = só naquele ano
--     (promoção pontual);
--   * pode haver várias campanhas por clínica, então o controle de "já enviei"
--     fica em mensagens_programadas_envios (campanha × lead × ano), e não numa
--     coluna do lead.
--
-- A mensagem sai com {nome} (primeiro nome do cliente) e {clinica} (nome da
-- clínica dona do lead) já trocados — igual a aniversariantes_do_dia() na 025.
--
-- Não aplicar sem revisão. Rodar no SQL Editor do Supabase, em uma transação.

begin;

-- ─── 1. Campanhas da clínica ───────────────────────────────────────────────
create table if not exists public.mensagens_programadas (
  id         uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.configuracoes_clinica(id) on delete cascade,
  nome       text not null,
  mensagem   text not null,
  dia        integer not null,
  mes        integer not null,
  ano        integer,
  ativo      boolean not null default false,
  created_at timestamptz not null default now(),
  unique (clinica_id, nome),
  constraint mensagens_programadas_nome_check    check (length(btrim(nome)) between 1 and 60),
  constraint mensagens_programadas_mensagem_check check (length(btrim(mensagem)) between 1 and 1000),
  constraint mensagens_programadas_mes_check     check (mes between 1 and 12),
  constraint mensagens_programadas_ano_check     check (ano is null or ano between 2000 and 2100),
  -- Dia válido para o mês (31/04 nunca dispararia e viraria campanha morta).
  -- Fevereiro aceita 29 porque o ano bissexto existe.
  constraint mensagens_programadas_dia_check check (
    dia between 1 and 31
    and dia <= extract(day from date_trunc('month', make_date(2024, mes, 1)) + interval '1 month - 1 day')
  )
);

create index if not exists mensagens_programadas_clinica_idx on public.mensagens_programadas (clinica_id);

alter table public.mensagens_programadas enable row level security;

drop policy if exists "mensagens_programadas_all_by_clinica_or_admin" on public.mensagens_programadas;
create policy "mensagens_programadas_all_by_clinica_or_admin"
  on public.mensagens_programadas
  for all
  using (clinica_id = public.current_clinica_id() or public.current_user_is_super_admin())
  with check (clinica_id = public.current_clinica_id() or public.current_user_is_super_admin());

-- ─── 2. Controle de envio: uma linha por campanha × lead × ano ─────────────
create table if not exists public.mensagens_programadas_envios (
  campanha_id uuid not null references public.mensagens_programadas(id) on delete cascade,
  lead_id     uuid not null references public.leads_clinica(id) on delete cascade,
  ano         integer not null,
  enviado_em  timestamptz not null default now(),
  primary key (campanha_id, lead_id, ano)
);

-- Só o job (service_role) lê e escreve aqui; RLS ligada e sem policy para o app.
alter table public.mensagens_programadas_envios enable row level security;

revoke all on table public.mensagens_programadas_envios from public, anon, authenticated;

-- ─── 3. O que enviar hoje ──────────────────────────────────────────────────
create or replace function public.mensagens_programadas_do_dia()
returns table (
  campanha_id uuid,
  nome_campanha text,
  lead_id uuid,
  nome_lead text,
  whatsapp_lead text,
  id_conta_chatwoot text,
  id_conversa_chatwoot text,
  nome_clinica text,
  mensagem text
)
language sql
stable
security definer
set search_path = public
as $$
  with hoje as (
    select (now() at time zone 'America/Sao_Paulo')::date as d
  )
  select mp.id,
         mp.nome,
         l.id,
         l.nome_lead,
         l.whatsapp_lead,
         l.id_conta_chatwoot,
         l.id_conversa_chatwoot,
         c.nome_clinica,
         replace(
           replace(
             mp.mensagem,
             '{nome}',
             coalesce(nullif(split_part(btrim(coalesce(l.nome_lead, '')), ' ', 1), ''), 'cliente')
           ),
           '{clinica}',
           coalesce(nullif(btrim(coalesce(c.nome_clinica, '')), ''), 'nossa clínica')
         ) as mensagem
  from public.mensagens_programadas mp
  join public.configuracoes_clinica c on c.id = mp.clinica_id
  join public.leads_clinica l on l.clinica_id = mp.clinica_id
  cross join hoje
  where mp.ativo
    and extract(day from hoje.d) = mp.dia
    and extract(month from hoje.d) = mp.mes
    and (mp.ano is null or mp.ano = extract(year from hoje.d))
    and not l.arquivado
    and nullif(btrim(coalesce(l.whatsapp_lead, '')), '') is not null
    and not exists (
      select 1
      from public.mensagens_programadas_envios e
      where e.campanha_id = mp.id
        and e.lead_id = l.id
        and e.ano = extract(year from hoje.d)
    )
  order by mp.id, l.nome_lead
$$;

-- ─── 4. Marca o envio (idempotente) ────────────────────────────────────────
create or replace function public.marcar_mensagem_programada_enviada(p_campanha uuid, p_lead uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.mensagens_programadas_envios (campanha_id, lead_id, ano)
  values (p_campanha, p_lead, extract(year from (now() at time zone 'America/Sao_Paulo')::date))
  on conflict (campanha_id, lead_id, ano) do nothing
$$;

-- ─── 5. Só o n8n (service_role) executa ────────────────────────────────────
revoke all on function public.mensagens_programadas_do_dia() from public, anon, authenticated;
revoke all on function public.marcar_mensagem_programada_enviada(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mensagens_programadas_do_dia() to service_role;
grant execute on function public.marcar_mensagem_programada_enviada(uuid, uuid) to service_role;

commit;
