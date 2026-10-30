-- 030: correções da auditoria do funil enxuto (banco).
--
-- NÃO aplicada automaticamente. Rode no SQL Editor do Supabase depois de revisar.
-- Antes, confira o estado real do banco:
--   select schemaname, tablename, policyname from pg_policies where schemaname = 'public';
--   select jobid, jobname, schedule from cron.job;   -- 027 deve ter removido verifica_retornos_proximos
--
-- Conteúdo:
--   1. REVOKE em verifica_retornos_proximos (era RPC aberta a anon/authenticated).
--   2. Guards da 012 deixam passar service_role / SQL Editor (sem JWT de usuário).
--   3. marca_lead_recorrente volta a reativar ex-paciente (perdido desde a 016).
--   4. Agendamento: data_agendamento também em orcamento_pendente, consulta_realizada
--      e follow_up_3_feito; editar a data de uma consulta agendada sincroniza o lead.
--   5. Proteção da última consulta realizada passa a cobrir consulta_realizada.
--   6. configuracoes_clinica: só super admin / service muda numero_whatsapp e nicho.
--   7. Índices que faltavam e unique (clinica_id, dia_semana) em horario_comercial.

begin;

-- ─── 1. RPC aberta ──────────────────────────────────────────────────────────
-- pg_cron roda como postgres, então não precisa de grant.
revoke all on function public.verifica_retornos_proximos() from public, anon, authenticated;

-- ─── 2. Bypass para chamadas sem usuário (service_role, SQL Editor) ─────────
create or replace function public.chamada_privilegiada()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(auth.role() = 'service_role', false)
      or session_user in ('postgres', 'supabase_admin')
$$;

revoke all on function public.chamada_privilegiada() from public, anon, authenticated;

create or replace function public.usuarios_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.chamada_privilegiada() or public.current_user_is_super_admin() then
    return new;
  end if;

  if old.id = auth.uid() then
    if new.is_super_admin is distinct from old.is_super_admin then
      raise exception 'Sem permissão para alterar is_super_admin';
    end if;
    if new.clinica_id is distinct from old.clinica_id then
      raise exception 'Sem permissão para alterar a clínica do próprio usuário';
    end if;
  else
    if old.clinica_id is null or old.clinica_id is distinct from public.current_clinica_id() then
      raise exception 'Sem permissão para alterar este usuário';
    end if;
    if new.clinica_id is not null
       or new.is_super_admin is distinct from old.is_super_admin
       or new.nome is distinct from old.nome
       or new.avatar_url is distinct from old.avatar_url then
      raise exception 'Membros só podem remover o vínculo de colegas da clínica';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.usuarios_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.chamada_privilegiada() or public.current_user_is_super_admin() then
    return new;
  end if;

  new.is_super_admin := false;

  if new.clinica_id is not null and not exists (
    select 1
    from public.convites_clinica c
    where c.clinica_id = new.clinica_id
      and lower(c.email) = lower(auth.jwt() ->> 'email')
  ) then
    raise exception 'Sem convite pendente para esta clínica';
  end if;

  return new;
end;
$$;

revoke all on function public.usuarios_guard_update() from public, anon, authenticated;
revoke all on function public.usuarios_guard_insert() from public, anon, authenticated;

-- ─── 3. Consulta realizada reativa ex-paciente ──────────────────────────────
create or replace function public.marca_lead_recorrente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'realizada'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update public.leads_clinica
    set status = case when atendimento_manual then status else 'orcamento_pendente' end,
        data_virou_recorrente = new.data_consulta,
        data_prevista_retorno = null,
        arquivado = false,
        arquivado_em = null
    where id = new.lead_id;
  end if;
  return new;
end;
$$;

-- ─── 4. Sincronização de agendamento ────────────────────────────────────────
create or replace function public.consulta_sincroniza_agendamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outras int;
begin
  if tg_op in ('INSERT', 'UPDATE')
     and new.status = 'agendada'
     and (tg_op = 'INSERT' or old.status is distinct from 'agendada') then

    update public.leads_clinica
    set status = case when atendimento_manual then status else 'consulta_agendada' end,
        data_agendamento = new.data_consulta
    where id = new.lead_id
      and status in ('iniciou_conversa', 'conversando', 'follow_up_1_feito',
                     'follow_up_2_feito', 'consulta_cancelada', 'consulta_confirmada');

    update public.leads_clinica
    set data_agendamento = new.data_consulta
    where id = new.lead_id
      and status in ('consulta_agendada', 'follow_up_3_feito', 'consulta_confirmada',
                     'orcamento_pendente', 'consulta_realizada', 'paciente_recorrente',
                     'retornar_3_meses', 'retornar_6_meses', 'retornar_1_ano');
  end if;

  -- Só a data mudou numa consulta que continua agendada.
  if tg_op = 'UPDATE'
     and old.status = 'agendada' and new.status = 'agendada'
     and old.data_consulta is distinct from new.data_consulta then
    update public.leads_clinica
    set data_agendamento = new.data_consulta
    where id = new.lead_id
      and data_agendamento is not null;
  end if;

  if (tg_op = 'DELETE' and old.status = 'agendada')
     or (tg_op = 'UPDATE' and old.status = 'agendada' and new.status in ('cancelada', 'faltou')) then

    select count(*) into v_outras
    from public.consultas c
    where c.lead_id = old.lead_id
      and c.status = 'agendada'
      and c.id <> old.id;

    if v_outras = 0 then
      update public.leads_clinica
      set status = case when atendimento_manual then status else 'consulta_cancelada' end,
          data_agendamento = null
      where id = old.lead_id
        and status in ('consulta_agendada', 'follow_up_3_feito', 'consulta_confirmada');

      update public.leads_clinica
      set data_agendamento = null
      where id = old.lead_id
        and status in ('orcamento_pendente', 'consulta_realizada', 'paciente_recorrente',
                       'retornar_3_meses', 'retornar_6_meses', 'retornar_1_ano');
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- ─── 5. Proteção da última consulta realizada ───────────────────────────────
create or replace function public.consulta_protege_paciente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_outras int;
begin
  if old.status <> 'realizada' or (tg_op = 'UPDATE' and new.status = 'realizada') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select l.status into v_status from public.leads_clinica l where l.id = old.lead_id;
  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if v_status not in ('consulta_realizada', 'orcamento_pendente', 'paciente_recorrente',
                      'retornar_3_meses', 'retornar_6_meses', 'retornar_1_ano') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select count(*) into v_outras
  from public.consultas c
  where c.lead_id = old.lead_id
    and c.status = 'realizada'
    and c.id <> old.id;

  if v_outras = 0 then
    raise exception 'Não é possível remover a última consulta realizada de um paciente. Altere a etapa do lead antes.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- ─── 6. numero_whatsapp e nicho só por super admin / service ────────────────
-- numero_whatsapp é a chave de roteamento do n8n; nicho define o funil. A edição
-- hoje só acontece em /admin/clinicas (super admin).
create or replace function public.clinica_guard_colunas_sensiveis()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.chamada_privilegiada() or public.current_user_is_super_admin() then
    return new;
  end if;
  if new.numero_whatsapp is distinct from old.numero_whatsapp
     or new.nicho is distinct from old.nicho then
    raise exception 'Somente o administrador do sistema pode alterar o WhatsApp ou o nicho da clínica';
  end if;
  return new;
end;
$$;

drop trigger if exists clinica_guard_colunas_sensiveis_trg on public.configuracoes_clinica;
create trigger clinica_guard_colunas_sensiveis_trg
  before update on public.configuracoes_clinica
  for each row
  execute function public.clinica_guard_colunas_sensiveis();

revoke all on function public.clinica_guard_colunas_sensiveis() from public, anon, authenticated;

-- ─── 7. Índices e unicidade ─────────────────────────────────────────────────
create index if not exists leads_clinica_clinica_whatsapp_idx
  on public.leads_clinica (clinica_id, whatsapp_lead);
create index if not exists leads_clinica_clinica_arquivado_idx
  on public.leads_clinica (clinica_id, arquivado);
create index if not exists consultas_data_consulta_idx
  on public.consultas (data_consulta);

do $$
begin
  if exists (
    select 1 from public.horario_comercial
    group by clinica_id, dia_semana having count(*) > 1
  ) then
    raise notice 'horario_comercial tem (clinica_id, dia_semana) duplicado: unique NÃO criado. Limpe as duplicatas e rode de novo.';
  elsif not exists (
    select 1 from pg_constraint where conname = 'horario_comercial_clinica_dia_key'
  ) then
    alter table public.horario_comercial
      add constraint horario_comercial_clinica_dia_key unique (clinica_id, dia_semana);
  end if;
end;
$$;

commit;
