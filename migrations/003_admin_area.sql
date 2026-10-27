-- Área administrativa (gerenciar clínicas) — versão MVP sem Edge Function.
-- Ver plan.md §4 para o desenho completo (a versão com Edge Function fica
-- para depois, se for necessária). Aqui: só um flag de super admin.
--
-- Como o RLS ainda não é escopado por clínica (Fase 3 do plan.md, pendente),
-- qualquer usuário autenticado já consegue ler/escrever qualquer linha hoje —
-- este flag é um controle de nível de interface (esconde a rota /admin/clinicas
-- de quem não é admin), não uma fronteira de segurança no banco ainda.
--
-- Executado via migrations/003_admin_area.sh (gitignored, contém o token de
-- Management API do Supabase — mesmo padrão do setup_db.sh).

alter table public.usuarios
  add column if not exists is_super_admin boolean not null default false;

-- Promoção a super admin é feita manualmente, por linha específica, não em
-- massa — ver migrations/004_grant_super_admin.sh (gerado sob demanda).
