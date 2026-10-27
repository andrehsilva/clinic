-- Convites de usuário por e-mail, já pré-vinculados a uma clínica.
-- Resolve o fluxo em 2 etapas (convidar -> depois vincular manualmente) que
-- hoje obriga o super admin a voltar em "Usuários aguardando vínculo" e
-- escolher a clínica certa. Com esta tabela, o convite já nasce com o
-- clinica_id certo; no primeiro login, o AuthContext consome esse registro
-- e atribui o clinica_id automaticamente ao criar a linha em usuarios.

create table if not exists public.convites_clinica (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  clinica_id uuid not null references public.configuracoes_clinica(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists convites_clinica_email_idx
  on public.convites_clinica (lower(email));

alter table public.convites_clinica enable row level security;

create policy "convites_clinica_all_auth"
  on public.convites_clinica
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
