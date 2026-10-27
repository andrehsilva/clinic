-- Campo simples para a secretária colar o link da pasta do Google Drive do
-- cliente (gerenciado manualmente por ela, fora do app — sem OAuth, sem
-- integração automática. Ver ideas/google-drive-por-clinica.md para a ideia
-- maior de integração automática, ainda não aprovada).
-- Executado via migrations/002_add_link_drive.sh (gitignored, contém o token
-- de Management API do Supabase — mesmo padrão do setup_db.sh).

alter table public.leads_clinica
  add column if not exists link_drive text;
