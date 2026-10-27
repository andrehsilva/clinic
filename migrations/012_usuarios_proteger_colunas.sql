-- 012: fecha escalada de privilégio em public.usuarios.
--
-- Problema (confirmado pelo texto das policies em produção):
--   - usuarios_update_own_or_clinica_or_admin tem with_check com
--     "auth.uid() = id", sem restringir colunas. Qualquer usuário pode fazer
--     update usuarios set is_super_admin = true, clinica_id = '<outra>'
--     na própria linha e ganhar acesso a todas as clínicas.
--   - usuarios_insert_own aceita qualquer is_super_admin / clinica_id no
--     insert da própria linha.
--
-- Estratégia: manter as policies (RLS continua igual) e acrescentar triggers
-- que validam cada alteração. Não usamos GRANT por coluna porque
-- Configuracoes.tsx (remoção de colega: clinica_id -> null) e
-- AdminClinicas.tsx (super admin define clinica_id) precisam continuar
-- funcionando.
--
-- Regras:
--   UPDATE, quando o autor NÃO é super admin:
--     - na própria linha: não pode mudar is_super_admin nem clinica_id;
--     - na linha de colega da mesma clínica: só pode remover o vínculo
--       (clinica_id -> null) e não pode mudar nome/avatar/is_super_admin.
--   INSERT, quando o autor NÃO é super admin (a própria linha):
--     - is_super_admin é forçado para false;
--     - clinica_id só pode ser nulo ou a clínica de um convite pendente do
--       e-mail do JWT.
--
-- Pré-requisito no código: AuthContext.tsx precisa inserir o usuário ANTES
-- de apagar o convite (a validação do insert consulta convites_clinica).

-- ─── UPDATE ────────────────────────────────────────────────────────────────
create or replace function public.usuarios_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_is_super_admin() then
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
    -- Colega: só pode ser desvinculado da mesma clínica.
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

drop trigger if exists usuarios_guard_update_trg on public.usuarios;
create trigger usuarios_guard_update_trg
  before update on public.usuarios
  for each row
  execute function public.usuarios_guard_update();

-- ─── INSERT ────────────────────────────────────────────────────────────────
create or replace function public.usuarios_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_is_super_admin() then
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

drop trigger if exists usuarios_guard_insert_trg on public.usuarios;
create trigger usuarios_guard_insert_trg
  before insert on public.usuarios
  for each row
  execute function public.usuarios_guard_insert();

-- Revoga a execução pública das funções de trigger (não são RPC).
revoke all on function public.usuarios_guard_update() from public, anon, authenticated;
revoke all on function public.usuarios_guard_insert() from public, anon, authenticated;
