-- As tabelas de negócio (leads_clinica, consultas, horario_comercial,
-- servicos_clinica, configuracoes_clinica, convites_clinica) ainda usam a
-- policy original de setup_db.sh: "auth.role() = 'authenticated'" — ou seja,
-- qualquer usuário autenticado de qualquer clínica pode ler/escrever dados de
-- qualquer outra clínica via API direta. O isolamento hoje depende só do
-- filtro .eq('clinica_id', ...) no client. Esta migration fecha isso no
-- banco, reaproveitando current_clinica_id()/current_user_is_super_admin()
-- (funções security definer já criadas em 009_usuarios_rls_clinica.sql).

-- ─── leads_clinica ─────────────────────────────────────────────────────────
drop policy if exists "leads_all_auth" on public.leads_clinica;

create policy "leads_all_by_clinica_or_admin"
  on public.leads_clinica
  for all
  using (clinica_id = public.current_clinica_id() or public.current_user_is_super_admin())
  with check (clinica_id = public.current_clinica_id() or public.current_user_is_super_admin());

-- ─── horario_comercial ─────────────────────────────────────────────────────
drop policy if exists "horario_all_auth" on public.horario_comercial;

create policy "horario_all_by_clinica_or_admin"
  on public.horario_comercial
  for all
  using (clinica_id = public.current_clinica_id() or public.current_user_is_super_admin())
  with check (clinica_id = public.current_clinica_id() or public.current_user_is_super_admin());

-- ─── servicos_clinica ──────────────────────────────────────────────────────
drop policy if exists "servicos_all_auth" on public.servicos_clinica;

create policy "servicos_all_by_clinica_or_admin"
  on public.servicos_clinica
  for all
  using (clinica_id = public.current_clinica_id() or public.current_user_is_super_admin())
  with check (clinica_id = public.current_clinica_id() or public.current_user_is_super_admin());

-- ─── configuracoes_clinica (a própria "id" é o clinica_id usado alhures) ───
drop policy if exists "config_all_auth" on public.configuracoes_clinica;

create policy "config_all_by_clinica_or_admin"
  on public.configuracoes_clinica
  for all
  using (id = public.current_clinica_id() or public.current_user_is_super_admin())
  with check (id = public.current_clinica_id() or public.current_user_is_super_admin());

-- ─── consultas (sem clinica_id própria — herda via lead_id) ───────────────
create index if not exists consultas_lead_id_idx on public.consultas (lead_id);

drop policy if exists "consultas_all_auth" on public.consultas;

create policy "consultas_all_by_clinica_or_admin"
  on public.consultas
  for all
  using (
    exists (
      select 1 from public.leads_clinica l
      where l.id = consultas.lead_id
        and (l.clinica_id = public.current_clinica_id() or public.current_user_is_super_admin())
    )
  )
  with check (
    exists (
      select 1 from public.leads_clinica l
      where l.id = consultas.lead_id
        and (l.clinica_id = public.current_clinica_id() or public.current_user_is_super_admin())
    )
  );

-- ─── convites_clinica ──────────────────────────────────────────────────────
-- O convidado ainda não tem clinica_id atribuído quando lê/consome o próprio
-- convite no primeiro login (AuthContext.tsx) — por isso select/delete também
-- aceitam bater por e-mail, não só por clinica_id.
drop policy if exists "convites_clinica_all_auth" on public.convites_clinica;

create policy "convites_select_by_clinica_email_or_admin"
  on public.convites_clinica
  for select
  using (
    clinica_id = public.current_clinica_id()
    or lower(email) = lower(auth.jwt() ->> 'email')
    or public.current_user_is_super_admin()
  );

create policy "convites_insert_by_clinica_or_admin"
  on public.convites_clinica
  for insert
  with check (clinica_id = public.current_clinica_id() or public.current_user_is_super_admin());

create policy "convites_update_by_clinica_or_admin"
  on public.convites_clinica
  for update
  using (clinica_id = public.current_clinica_id() or public.current_user_is_super_admin())
  with check (clinica_id = public.current_clinica_id() or public.current_user_is_super_admin());

create policy "convites_delete_by_clinica_email_or_admin"
  on public.convites_clinica
  for delete
  using (
    clinica_id = public.current_clinica_id()
    or lower(email) = lower(auth.jwt() ->> 'email')
    or public.current_user_is_super_admin()
  );
