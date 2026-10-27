-- 014c: remove SOMENTE os dados fictícios da Clínica Rodrigues.
--
-- Filtra por id_conta_chatwoot = 'FAKE' e pelo clinica_id da Rodrigues.
-- As consultas são apagadas em cascata (FK on delete cascade).
-- Não toca em leads reais.
--
-- Rodar no SQL Editor. Antes de apagar, mostra quantos registros serão removidos.

begin;

-- Prévia: quantos leads fictícios existem
select count(*) as leads_fake
from public.leads_clinica
where id_conta_chatwoot = 'FAKE'
  and clinica_id = 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44';

delete from public.leads_clinica
where id_conta_chatwoot = 'FAKE'
  and clinica_id = 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44';

-- Conferência: deve retornar 0
select count(*) as leads_fake_restantes
from public.leads_clinica
where id_conta_chatwoot = 'FAKE';

commit;
