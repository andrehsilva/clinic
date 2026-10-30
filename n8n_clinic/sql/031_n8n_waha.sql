-- 031: RPCs de apoio aos fluxos n8n (WhatsApp via WAHA). NÃO APLICADA.
--
-- Revise e rode no SQL Editor do Supabase, em staging primeiro.
-- Depende das migrations 001-030 (principalmente 010, 018, 026, 029, 030).
--
-- Ideia: toda regra de negócio que o bot precisa (resolver clínica, registrar
-- mensagem do lead, ver horários, agendar, cancelar, chamar humano, escolher quem
-- recebe follow-up/lembrete/retorno) fica aqui, em SQL. Os fluxos n8n só chamam
-- /rest/v1/rpc/<função> com a credencial service_role. Vantagens: um lugar para
-- testar, atômico, e o filtro por clinica_id/atendimento_manual/arquivado não
-- depende de cada nó do n8n.
--
-- Convenções
--   * Só service_role executa (mesmo padrão da 026). anon/authenticated não.
--   * Telefone sempre normalizado para dígitos (n8n_digitos).
--   * Horários de agenda são SP; o bot passa 'YYYY-MM-DD HH24:MI' (hora local).
--   * Agenda = tabela consultas. NUNCA escrever leads_clinica.status ao agendar:
--     os triggers (018/023/029/030) movem a etapa.
--
-- PRÉ-CHECK OBRIGATÓRIO antes de aplicar:
--   select data_type from information_schema.columns
--    where table_schema='public' and table_name='consultas' and column_name='data_consulta';
--   -> 'timestamp with time zone' é o esperado. Se vier 'timestamp without time zone',
--      troque n8n_to_consulta_ts() (abaixo) para devolver o timestamp local sem conversão.
--   select column_name, data_type from information_schema.columns
--    where table_schema='public' and table_name='horario_comercial' and column_name in ('hora_inicio','hora_fim');
--   -> esperado 'time without time zone' (n8n_slot_livre compara como time).

begin;

-- ─── 0. Configuração por clínica ───────────────────────────────────────────
alter table public.configuracoes_clinica
  add column if not exists waha_session text,                      -- sessão WAHA; null = dígitos de numero_whatsapp
  add column if not exists sobre_clinica text,                     -- texto livre p/ a IA: endereço, pagamento, convênios, valor da consulta...
  add column if not exists whatsapp_aviso_humano text,             -- número da secretaria que recebe o aviso "lead pediu humano"
  add column if not exists automacao_ativa boolean not null default true;  -- chave geral dos fluxos (bot, follow-up, lembretes)

comment on column public.configuracoes_clinica.sobre_clinica is
  'Texto livre usado no prompt da IA (endereço, formas de pagamento, convênios, valor da consulta, estacionamento...).';

-- ─── 1. Helpers ─────────────────────────────────────────────────────────────
create or replace function public.n8n_digitos(p text)
returns text
language sql
immutable
as $$ select regexp_replace(coalesce(p, ''), '\D', '', 'g') $$;

-- Hora local (SP) de um instante gravado em consultas.data_consulta.
create or replace function public.n8n_local(t timestamptz)
returns timestamp
language sql
immutable
as $$ select t at time zone 'America/Sao_Paulo' $$;

create or replace function public.n8n_local(t timestamp)
returns timestamp
language sql
immutable
as $$ select t $$;

-- Converte hora local SP em valor para consultas.data_consulta (timestamptz).
create or replace function public.n8n_to_consulta_ts(t timestamp)
returns timestamptz
language sql
immutable
as $$ select t at time zone 'America/Sao_Paulo' $$;

-- Slot livre? Devolve null se sim, ou o motivo: passado | fora_horario | ocupado.
-- p_ignorar: consulta a desconsiderar (reagendamento).
create or replace function public.n8n_slot_livre(
  p_clinica uuid, p_ini timestamp, p_dur int, p_ignorar uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_agora timestamp := (now() at time zone 'America/Sao_Paulo');
begin
  if p_ini < v_agora + interval '1 hour' then
    return 'passado';
  end if;

  if not exists (
    select 1 from public.horario_comercial h
    where h.clinica_id = p_clinica and h.ativo
      and h.dia_semana = extract(dow from p_ini)::int
      and p_ini::time >= h.hora_inicio
      and (p_ini + make_interval(mins => p_dur))::time <= h.hora_fim
  ) then
    return 'fora_horario';
  end if;

  if exists (
    select 1
    from public.consultas c
    join public.leads_clinica l on l.id = c.lead_id
    where l.clinica_id = p_clinica
      and c.status = 'agendada'
      and (p_ignorar is null or c.id <> p_ignorar)
      and public.n8n_local(c.data_consulta) < p_ini + make_interval(mins => p_dur)
      and public.n8n_local(c.data_consulta) + make_interval(mins => p_dur) > p_ini
  ) then
    return 'ocupado';
  end if;

  return null;
end;
$$;

-- ─── 2. Contexto da clínica (prompt do bot) ────────────────────────────────
create or replace function public.n8n_resolver_clinica(p_session text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'clinica_id',            c.id,
    'nome_clinica',          c.nome_clinica,
    'nicho',                 c.nicho,
    'numero_whatsapp',       c.numero_whatsapp,
    'waha_session',          coalesce(c.waha_session, public.n8n_digitos(c.numero_whatsapp)),
    'sobre_clinica',         coalesce(c.sobre_clinica, ''),
    'whatsapp_aviso_humano', public.n8n_digitos(c.whatsapp_aviso_humano),
    'automacao_ativa',       c.automacao_ativa,
    'servicos', coalesce((
      select jsonb_agg(jsonb_build_object('nome', s.nome, 'descricao', coalesce(s.descricao, '')) order by s.nome)
      from public.servicos_clinica s where s.clinica_id = c.id and s.ativo
    ), '[]'::jsonb),
    'horarios', coalesce((
      select jsonb_agg(jsonb_build_object(
               'dia_semana', h.dia_semana,
               'hora_inicio', to_char(h.hora_inicio, 'HH24:MI'),
               'hora_fim', to_char(h.hora_fim, 'HH24:MI')) order by h.dia_semana)
      from public.horario_comercial h where h.clinica_id = c.id and h.ativo
    ), '[]'::jsonb)
  )
  from public.configuracoes_clinica c
  where coalesce(c.waha_session, public.n8n_digitos(c.numero_whatsapp)) = p_session
  limit 1
$$;

-- ─── 3. Lead que acabou de escrever ────────────────────────────────────────
-- Cria o lead (iniciou_conversa) ou atualiza ultima_mensagem. A etapa só anda
-- para 'conversando' a partir de início/reengajamento/cancelada, e nunca para
-- lead em atendimento manual. Agendado, confirmado e pacientes não mudam.
create or replace function public.n8n_registrar_mensagem_lead(
  p_clinica uuid, p_telefone text, p_nome text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel  text := public.n8n_digitos(p_telefone);
  v_lead public.leads_clinica;
  v_novo boolean := false;
begin
  if v_tel = '' then
    raise exception 'telefone vazio';
  end if;

  select * into v_lead
  from public.leads_clinica
  where clinica_id = p_clinica and public.n8n_digitos(whatsapp_lead) = v_tel
  order by created_at
  limit 1
  for update;

  if not found then
    insert into public.leads_clinica
      (clinica_id, whatsapp_lead, nome_lead, status, inicio_atendimento, ultima_mensagem, minutos_ultima_mensagem)
    values
      (p_clinica, v_tel, nullif(btrim(coalesce(p_nome, '')), ''), 'iniciou_conversa', now(), now(), 0)
    returning * into v_lead;
    v_novo := true;
  else
    update public.leads_clinica
    set ultima_mensagem = now(),
        minutos_ultima_mensagem = 0,
        status = case
          when atendimento_manual then status
          when status in ('iniciou_conversa', 'follow_up_1_feito', 'follow_up_2_feito', 'consulta_cancelada')
            then 'conversando'
          else status
        end
    where id = v_lead.id
    returning * into v_lead;
  end if;

  return jsonb_build_object(
    'lead_id',            v_lead.id,
    'novo',               v_novo,
    'status',             v_lead.status,
    'nome_lead',          v_lead.nome_lead,
    'procedimento_interesse', v_lead.procedimento_interesse,
    'resumo_conversa',    v_lead.resumo_conversa,
    'atendimento_manual', v_lead.atendimento_manual,
    'arquivado',          v_lead.arquivado,
    'em_tratamento',      v_lead.em_tratamento,
    'data_agendamento',   v_lead.data_agendamento
  );
end;
$$;

-- Extração do CRM (nome, procedimento, resumo). Só preenche o que veio.
create or replace function public.n8n_atualizar_crm(
  p_lead uuid, p_nome text, p_procedimento text, p_resumo text
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.leads_clinica
  set nome_lead              = coalesce(nullif(btrim(coalesce(p_nome, '')), ''), nome_lead),
      procedimento_interesse = coalesce(nullif(btrim(coalesce(p_procedimento, '')), ''), procedimento_interesse),
      resumo_conversa        = coalesce(nullif(btrim(coalesce(p_resumo, '')), ''), resumo_conversa)
  where id = p_lead
$$;

-- ─── 4. Agenda (tools do agente) ───────────────────────────────────────────
create or replace function public.n8n_ver_horarios(
  p_clinica uuid, p_dias int default 7, p_duracao int default 30
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with hoje as (
    select (now() at time zone 'America/Sao_Paulo')::date as d
  ),
  dias as (
    select (hoje.d + n)::date as dia
    from hoje, generate_series(0, greatest(least(p_dias, 21), 1)) n
  ),
  slots as (
    select dias.dia,
           (dias.dia + h.hora_inicio) + (g * make_interval(mins => p_duracao)) as ini
    from dias
    join public.horario_comercial h
      on h.clinica_id = p_clinica and h.ativo and h.dia_semana = extract(dow from dias.dia)::int
    cross join generate_series(0, 95) g
    where (dias.dia + h.hora_inicio) + ((g + 1) * make_interval(mins => p_duracao)) <= (dias.dia + h.hora_fim)
  ),
  livres as (
    select dia, ini from slots where public.n8n_slot_livre(p_clinica, ini, p_duracao) is null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'data', to_char(dia, 'YYYY-MM-DD'),
           'dia_semana', (array['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[extract(dow from dia)::int + 1],
           'horarios', hs) order by dia), '[]'::jsonb)
  from (
    select dia, jsonb_agg(to_char(ini, 'HH24:MI') order by ini) as hs
    from livres group by dia
  ) x
$$;

create or replace function public.n8n_agendar_consulta(
  p_clinica uuid, p_telefone text, p_data_hora text,
  p_procedimento text default null, p_nome text default null, p_duracao int default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead   public.leads_clinica;
  v_ini    timestamp;
  v_motivo text;
  v_id     uuid;
  v_ja     timestamp;
begin
  select * into v_lead from public.leads_clinica
  where clinica_id = p_clinica and public.n8n_digitos(whatsapp_lead) = public.n8n_digitos(p_telefone)
  order by created_at limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'lead_nao_encontrado');
  end if;

  begin
    v_ini := p_data_hora::timestamp;
  exception when others then
    return jsonb_build_object('ok', false, 'erro', 'data_invalida', 'dica', 'use YYYY-MM-DD HH:MM');
  end;

  select min(public.n8n_local(c.data_consulta)) into v_ja
  from public.consultas c
  where c.lead_id = v_lead.id and c.status = 'agendada'
    and public.n8n_local(c.data_consulta) >= (now() at time zone 'America/Sao_Paulo');
  if v_ja is not null then
    return jsonb_build_object('ok', false, 'erro', 'ja_agendado',
                              'data_atual', to_char(v_ja, 'YYYY-MM-DD HH24:MI'),
                              'dica', 'ofereça reagendar');
  end if;

  v_motivo := public.n8n_slot_livre(p_clinica, v_ini, p_duracao);
  if v_motivo is not null then
    return jsonb_build_object('ok', false, 'erro', v_motivo);
  end if;

  if nullif(btrim(coalesce(p_nome, '')), '') is not null then
    update public.leads_clinica set nome_lead = btrim(p_nome) where id = v_lead.id;
  end if;

  insert into public.consultas (lead_id, procedimento, data_consulta, status)
  values (
    v_lead.id,
    coalesce(nullif(btrim(coalesce(p_procedimento, '')), ''), v_lead.procedimento_interesse, 'Consulta'),
    public.n8n_to_consulta_ts(v_ini),
    'agendada'
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'consulta_id', v_id, 'data', to_char(v_ini, 'YYYY-MM-DD HH24:MI'));
end;
$$;

create or replace function public.n8n_reagendar_consulta(
  p_clinica uuid, p_telefone text, p_data_hora text, p_duracao int default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead   public.leads_clinica;
  v_cons   public.consultas;
  v_ini    timestamp;
  v_motivo text;
begin
  select * into v_lead from public.leads_clinica
  where clinica_id = p_clinica and public.n8n_digitos(whatsapp_lead) = public.n8n_digitos(p_telefone)
  order by created_at limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'lead_nao_encontrado');
  end if;

  select * into v_cons from public.consultas
  where lead_id = v_lead.id and status = 'agendada'
  order by data_consulta desc limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'sem_consulta_agendada');
  end if;

  begin
    v_ini := p_data_hora::timestamp;
  exception when others then
    return jsonb_build_object('ok', false, 'erro', 'data_invalida', 'dica', 'use YYYY-MM-DD HH:MM');
  end;

  v_motivo := public.n8n_slot_livre(p_clinica, v_ini, p_duracao, v_cons.id);
  if v_motivo is not null then
    return jsonb_build_object('ok', false, 'erro', v_motivo);
  end if;

  update public.consultas set data_consulta = public.n8n_to_consulta_ts(v_ini) where id = v_cons.id;
  return jsonb_build_object('ok', true, 'consulta_id', v_cons.id, 'data', to_char(v_ini, 'YYYY-MM-DD HH24:MI'));
end;
$$;

create or replace function public.n8n_cancelar_consulta(p_clinica uuid, p_telefone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cons public.consultas;
begin
  select c.* into v_cons
  from public.consultas c
  join public.leads_clinica l on l.id = c.lead_id
  where l.clinica_id = p_clinica
    and public.n8n_digitos(l.whatsapp_lead) = public.n8n_digitos(p_telefone)
    and c.status = 'agendada'
  order by c.data_consulta desc limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'sem_consulta_agendada');
  end if;

  update public.consultas set status = 'cancelada' where id = v_cons.id;
  return jsonb_build_object('ok', true, 'consulta_id', v_cons.id);
end;
$$;

-- Paciente confirmou presença (resposta ao lembrete).
create or replace function public.n8n_confirmar_consulta(p_clinica uuid, p_telefone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.leads_clinica
  set status = 'consulta_confirmada'
  where clinica_id = p_clinica
    and public.n8n_digitos(whatsapp_lead) = public.n8n_digitos(p_telefone)
    and status in ('consulta_agendada', 'follow_up_3_feito')
    and not atendimento_manual
  returning id into v_id;
  return jsonb_build_object('ok', v_id is not null);
end;
$$;

-- ─── 5. Passar para humano ──────────────────────────────────────────────────
-- Liga atendimento_manual e registra o motivo como anotação (formato "iso|texto"
-- usado por LeadDetail.tsx). Devolve o número da secretaria para o aviso.
create or replace function public.n8n_chamar_humano(
  p_clinica uuid, p_telefone text, p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads_clinica;
  v_nota text;
  v_aviso text;
begin
  select * into v_lead from public.leads_clinica
  where clinica_id = p_clinica and public.n8n_digitos(whatsapp_lead) = public.n8n_digitos(p_telefone)
  order by created_at limit 1
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'lead_nao_encontrado');
  end if;

  v_nota := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
            || '|[Atendimento] ' || replace(coalesce(nullif(btrim(p_motivo), ''), 'Passou para atendimento humano'), E'\n', ' ');

  update public.leads_clinica
  set atendimento_manual = true,
      anotacoes = case when coalesce(anotacoes, '') = '' then v_nota else anotacoes || E'\n' || v_nota end
  where id = v_lead.id;

  select public.n8n_digitos(whatsapp_aviso_humano) into v_aviso
  from public.configuracoes_clinica where id = p_clinica;

  return jsonb_build_object('ok', true, 'lead_id', v_lead.id, 'nome_lead', v_lead.nome_lead,
                            'whatsapp_aviso_humano', nullif(v_aviso, ''));
end;
$$;

-- ─── 6. Follow-up de reengajamento (passos 1 e 2) ──────────────────────────
-- Passo 1: lead sem consulta, calado entre 20 min e 12 h  -> follow_up_1_feito
-- Passo 2: já em follow_up_1_feito, calado entre 24 h e 48 h -> follow_up_2_feito
-- O teto (12 h / 48 h) evita disparar para leads antigos quando os fluxos entram
-- no ar. Só roda das 8h às 20h59 (SP). Máx. 20 por execução.
create or replace function public.n8n_followup_elegiveis()
returns table (
  clinica_id uuid, waha_session text, nome_clinica text, nicho text, sobre_clinica text,
  lead_id uuid, nome_lead text, whatsapp_lead text,
  procedimento_interesse text, resumo_conversa text, passo int
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
         coalesce(c.waha_session, public.n8n_digitos(c.numero_whatsapp)),
         c.nome_clinica, c.nicho, coalesce(c.sobre_clinica, ''),
         l.id, l.nome_lead, public.n8n_digitos(l.whatsapp_lead),
         l.procedimento_interesse, l.resumo_conversa,
         case when l.status = 'follow_up_1_feito' then 2 else 1 end
  from public.leads_clinica l
  join public.configuracoes_clinica c on c.id = l.clinica_id
  where extract(hour from (now() at time zone 'America/Sao_Paulo')) between 8 and 20
    and c.automacao_ativa
    and not l.atendimento_manual and not l.arquivado and not l.em_tratamento
    and l.data_agendamento is null
    and public.n8n_digitos(l.whatsapp_lead) <> ''
    and l.ultima_mensagem is not null
    and (
      (l.status in ('iniciou_conversa', 'conversando')
         and l.ultima_mensagem <= now() - interval '20 minutes'
         and l.ultima_mensagem >  now() - interval '12 hours')
      or
      (l.status = 'follow_up_1_feito'
         and l.ultima_mensagem <= now() - interval '24 hours'
         and l.ultima_mensagem >  now() - interval '48 hours')
    )
  order by l.ultima_mensagem
  limit 20
$$;

-- Marca o passo enviado. Idempotente: só avança se o lead ainda está no estado esperado.
create or replace function public.n8n_marcar_followup(p_lead uuid, p_passo int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.leads_clinica
  set status = case when p_passo = 2 then 'follow_up_2_feito' else 'follow_up_1_feito' end
  where id = p_lead
    and not atendimento_manual
    and ((p_passo = 1 and status in ('iniciou_conversa', 'conversando'))
      or (p_passo = 2 and status = 'follow_up_1_feito'))
  returning id into v_id;
  return v_id is not null;
end;
$$;

-- ─── 7. Lembrete de consulta (follow_up_3_feito = Aguardando Confirmação) ──
-- Consulta agendada para amanhã (SP), lead ainda em consulta_agendada. Janela 9h-19h.
create or replace function public.n8n_lembretes_consulta()
returns table (
  clinica_id uuid, waha_session text, nome_clinica text, sobre_clinica text,
  lead_id uuid, nome_lead text, whatsapp_lead text,
  procedimento text, data_local text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
         coalesce(c.waha_session, public.n8n_digitos(c.numero_whatsapp)),
         c.nome_clinica, coalesce(c.sobre_clinica, ''),
         l.id, l.nome_lead, public.n8n_digitos(l.whatsapp_lead),
         co.procedimento,
         to_char(public.n8n_local(co.data_consulta), 'DD/MM "às" HH24:MI')
  from public.consultas co
  join public.leads_clinica l on l.id = co.lead_id
  join public.configuracoes_clinica c on c.id = l.clinica_id
  where extract(hour from (now() at time zone 'America/Sao_Paulo')) between 9 and 18
    and c.automacao_ativa
    and co.status = 'agendada'
    and l.status = 'consulta_agendada'
    and not l.atendimento_manual and not l.arquivado
    and public.n8n_digitos(l.whatsapp_lead) <> ''
    and public.n8n_local(co.data_consulta)::date = ((now() at time zone 'America/Sao_Paulo')::date + 1)
  order by co.data_consulta
  limit 20
$$;

create or replace function public.n8n_marcar_lembrete(p_lead uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.leads_clinica set status = 'follow_up_3_feito'
  where id = p_lead and status = 'consulta_agendada' and not atendimento_manual
  returning id into v_id;
  return v_id is not null;
end;
$$;

-- ─── 8. Retorno no dia previsto (substitui o pg_cron removido na 027) ──────
create or replace function public.n8n_retornos_do_dia()
returns table (
  clinica_id uuid, waha_session text, nome_clinica text, sobre_clinica text,
  lead_id uuid, nome_lead text, whatsapp_lead text,
  procedimento_interesse text, resumo_conversa text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
         coalesce(c.waha_session, public.n8n_digitos(c.numero_whatsapp)),
         c.nome_clinica, coalesce(c.sobre_clinica, ''),
         l.id, l.nome_lead, public.n8n_digitos(l.whatsapp_lead),
         l.procedimento_interesse, l.resumo_conversa
  from public.leads_clinica l
  join public.configuracoes_clinica c on c.id = l.clinica_id
  where extract(hour from (now() at time zone 'America/Sao_Paulo')) between 9 and 18
    and c.automacao_ativa
    and l.status in ('retornar_3_meses', 'retornar_6_meses', 'retornar_1_ano')
    and l.data_prevista_retorno is not null
    and (l.data_prevista_retorno at time zone 'America/Sao_Paulo')::date
        <= (now() at time zone 'America/Sao_Paulo')::date
    and not l.atendimento_manual and not l.arquivado and not l.em_tratamento
    and public.n8n_digitos(l.whatsapp_lead) <> ''
  order by l.data_prevista_retorno
  limit 20
$$;

create or replace function public.n8n_marcar_retorno(p_lead uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.leads_clinica set status = 'conversando'
  where id = p_lead
    and status in ('retornar_3_meses', 'retornar_6_meses', 'retornar_1_ano')
    and not atendimento_manual
  returning id into v_id;
  return v_id is not null;
end;
$$;

-- ─── 9. Aniversário e campanhas com a sessão WAHA ──────────────────────────
-- As funções da 025/026 devolvem colunas do Chatwoot e não a sessão. Estas
-- versões reaproveitam as originais e acrescentam clinica_id + waha_session.
create or replace function public.n8n_aniversariantes_do_dia()
returns table (
  lead_id uuid, nome_lead text, whatsapp_lead text,
  waha_session text, mensagem text
)
language sql
stable
security definer
set search_path = public
as $$
  select a.lead_id, a.nome_lead, public.n8n_digitos(a.whatsapp_lead),
         coalesce(c.waha_session, public.n8n_digitos(c.numero_whatsapp)),
         a.mensagem_aniversario
  from public.aniversariantes_do_dia() a
  join public.leads_clinica l on l.id = a.lead_id
  join public.configuracoes_clinica c on c.id = l.clinica_id
  where extract(hour from (now() at time zone 'America/Sao_Paulo')) between 9 and 18
    and c.automacao_ativa
    and public.n8n_digitos(a.whatsapp_lead) <> ''
  limit 50
$$;

create or replace function public.n8n_mensagens_programadas_do_dia()
returns table (
  campanha_id uuid, lead_id uuid, nome_lead text, whatsapp_lead text,
  waha_session text, mensagem text
)
language sql
stable
security definer
set search_path = public
as $$
  select m.campanha_id, m.lead_id, m.nome_lead, public.n8n_digitos(m.whatsapp_lead),
         coalesce(c.waha_session, public.n8n_digitos(c.numero_whatsapp)),
         m.mensagem
  from public.mensagens_programadas_do_dia() m
  join public.leads_clinica l on l.id = m.lead_id
  join public.configuracoes_clinica c on c.id = l.clinica_id
  where extract(hour from (now() at time zone 'America/Sao_Paulo')) between 9 and 18
    and c.automacao_ativa
    and public.n8n_digitos(m.whatsapp_lead) <> ''
  limit 50
$$;

-- ─── 10. Permissões: só service_role ────────────────────────────────────────
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'n8n\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.assinatura);
    execute format('grant execute on function %s to service_role', f.assinatura);
  end loop;
end;
$$;

commit;
