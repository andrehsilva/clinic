-- Fase 2 do plano multitenant (plan.md): backfill dos dados que existiam
-- antes do multitenant, atribuindo-os à clínica original ("Clínica Rodrigues",
-- id dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44) — ela vira "clínica #1".
-- Sem isso, ligar o filtro por clinica_id no restante do app faria os 12
-- leads / 7 horários / 14 procedimentos / 2 usuários existentes desaparecerem,
-- já que hoje estão todos com clinica_id nulo.

update public.leads_clinica
  set clinica_id = 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44'
  where clinica_id is null;

update public.horario_comercial
  set clinica_id = 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44'
  where clinica_id is null;

update public.servicos_clinica
  set clinica_id = 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44'
  where clinica_id is null;

update public.usuarios
  set clinica_id = 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44'
  where clinica_id is null;
