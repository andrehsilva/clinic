-- A policy original de `usuarios` ("usuarios_select_own"/"usuarios_update_own")
-- só permite auth.uid() = id — ou seja, ninguém enxergava colegas da própria
-- clínica nem o super admin conseguia ver quem está em cada clínica (a nova
-- aba "Usuários" em Configuracoes.tsx e a listagem em /admin/clinicas
-- dependem disso). Funções security definer evitam recursão de RLS ao
-- consultar a própria tabela usuarios dentro da policy.

create or replace function public.current_clinica_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select clinica_id from public.usuarios where id = auth.uid()
$$;

create or replace function public.current_user_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_super_admin from public.usuarios where id = auth.uid()), false)
$$;

drop policy if exists "usuarios_select_own" on public.usuarios;

create policy "usuarios_select_own_or_clinica_or_admin"
  on public.usuarios
  for select
  using (
    auth.uid() = id
    or clinica_id = public.current_clinica_id()
    or public.current_user_is_super_admin()
  );

drop policy if exists "usuarios_update_own" on public.usuarios;

create policy "usuarios_update_own_or_clinica_or_admin"
  on public.usuarios
  for update
  using (
    auth.uid() = id
    or clinica_id = public.current_clinica_id()
    or public.current_user_is_super_admin()
  )
  with check (
    auth.uid() = id
    or public.current_user_is_super_admin()
    or clinica_id is null
    or clinica_id = public.current_clinica_id()
  );
