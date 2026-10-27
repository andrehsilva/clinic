-- 014b: dados FICTÍCIOS para a Clínica Rodrigues (odontológica), para testar telas.
--
-- Pré-requisito: 013 aplicada e 014_clinica_rodrigues_odontologica.sql rodada.
-- Para remover depois: 014c_clinica_rodrigues_dados_ficticios_limpeza.sql
--
-- Como são identificados:
--   - id_conta_chatwoot = 'FAKE' em todos os leads (usado na limpeza)
--   - telefones no formato 55000000000NN (DDD 00, inválido de propósito)
--   - nomes genéricos e procedimentos de exemplo
--
-- O trigger trg_marca_lead_recorrente (migration 006) é desligado só durante o
-- insert, para que os status fiquem exatamente como definidos aqui, e religado no fim.
--
-- Rodar no SQL Editor do Supabase. Só rode uma vez: se repetir, os ids fixos
-- vão dar erro de chave duplicada (rode a limpeza antes para refazer).

begin;

alter table public.consultas disable trigger trg_marca_lead_recorrente;

insert into public.leads_clinica (
  id, clinica_id, nome_lead, whatsapp_lead, procedimento_interesse, resumo_conversa, status,
  inicio_atendimento, ultima_mensagem, id_conta_chatwoot, id_conversa_chatwoot, id_lead_chatwoot,
  inbox_id_chatwoot, data_nascimento, valor_pago_acumulado, data_virou_recorrente,
  data_prevista_retorno, data_agendamento, anotacoes
) values
  ('fa000000-0000-4000-8000-000000000001', 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44', 'Ana Lima', '550000000001', 'Limpeza e profilaxia', 'Perguntou valor e horários para limpeza.', 'iniciou_conversa', now() - interval '1 day', now() - interval '1 day', 'FAKE', 'FAKE-01', 'FAKE-01', '0', '1990-03-12', null, null, null, null, null),
  ('fa000000-0000-4000-8000-000000000002', 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44', 'Bruno Souza', '550000000002', 'Clareamento dental', 'Quer clarear antes de um evento.', 'iniciou_conversa', now() - interval '2 days', now() - interval '2 days', 'FAKE', 'FAKE-02', 'FAKE-02', '0', '1985-07-21', null, null, null, null, null),
  ('fa000000-0000-4000-8000-000000000003', 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44', 'Carla Mendes', '550000000003', 'Avaliação ortodôntica', 'Dúvidas sobre aparelho invisível.', 'conversando', now() - interval '4 days', now() - interval '3 days', 'FAKE', 'FAKE-03', 'FAKE-03', '0', '2001-11-05', null, null, null, null, null),
  ('fa000000-0000-4000-8000-000000000004', 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44', 'Diego Rocha', '550000000004', 'Implante dentário', 'Perdeu um dente e quer orçamento.', 'conversando', now() - interval '6 days', now() - interval '5 days', 'FAKE', 'FAKE-04', 'FAKE-04', '0', '1978-02-28', null, null, null, null, null),
  ('fa000000-0000-4000-8000-000000000005', 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44', 'Elisa Campos', '550000000005', 'Aparelho ortodôntico', 'Não respondeu ao primeiro contato.', 'follow_up_1_feito', now() - interval '9 days', now() - interval '8 days', 'FAKE', 'FAKE-05', 'FAKE-05', '0', '1996-09-14', null, null, null, null, null),
  ('fa000000-0000-4000-8000-000000000006', 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44', 'Felipe Nunes', '550000000006', 'Tratamento de canal', 'Dor no dente 36; sem resposta no segundo contato.', 'follow_up_2_feito', now() - interval '12 days', now() - interval '10 days', 'FAKE', 'FAKE-06', 'FAKE-06', '0', '1988-05-30', null, null, null, null, null),
  ('fa000000-0000-4000-8000-000000000007', 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44', 'Gabriela Alves', '550000000007', 'Faceta de porcelana', 'Consulta de avaliação marcada.', 'consulta_agendada', now() - interval '3 days', now() - interval '1 day', 'FAKE', 'FAKE-07', 'FAKE-07', '0', '1993-12-02', null, null, null, now() + interval '2 days', null),
  ('fa000000-0000-4000-8000-000000000008', 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44', 'Henrique Dias', '550000000008', 'Limpeza e profilaxia', 'Agendou pelo WhatsApp.', 'consulta_agendada', now() - interval '4 days', now() - interval '2 days', 'FAKE', 'FAKE-08', 'FAKE-08', '0', '1970-06-18', null, null, null, now() + interval '5 days', null),
  ('fa000000-0000-4000-8000-000000000009', 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44', 'Isabela Freitas', '550000000009', 'Restauração em resina', 'Aguardando confirmação da consulta de amanhã.', 'follow_up_3_feito', now() - interval '5 days', now() - interval '1 day', 'FAKE', 'FAKE-09', 'FAKE-09', '0', '1999-04-09', null, null, null, now() + interval '1 day', null),
  ('fa000000-0000-4000-8000-000000000010', 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44', 'João Pires', '550000000010', 'Extração de siso', 'Cancelou por motivo pessoal.', 'consulta_cancelada', now() - interval '8 days', now() - interval '1 day', 'FAKE', 'FAKE-10', 'FAKE-10', '0', '1992-10-25', null, null, null, now() - interval '1 day', null),
  ('fa000000-0000-4000-8000-000000000011', 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44', 'Karina Moura', '550000000011', 'Avaliação odontológica geral', 'Compareceu à avaliação; aguardando orçamento.', 'consulta_realizada', now() - interval '10 days', now() - interval '7 days', 'FAKE', 'FAKE-11', 'FAKE-11', '0', '1981-01-17', 150, null, null, now() - interval '7 days', null),
  ('fa000000-0000-4000-8000-000000000012', 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44', 'Lucas Ferreira', '550000000012', 'Implante dentário', 'Avaliação feita; implante em planejamento.', 'consulta_realizada', now() - interval '14 days', now() - interval '10 days', 'FAKE', 'FAKE-12', 'FAKE-12', '0', '1975-08-08', 300, null, null, now() - interval '10 days', null),
  ('fa000000-0000-4000-8000-000000000013', 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44', 'Mariana Gomes', '550000000013', 'Clareamento dental', 'Paciente recorrente; faz manutenção semestral.', 'paciente_recorrente', now() - interval '60 days', now() - interval '40 days', 'FAKE', 'FAKE-13', 'FAKE-13', '0', '1990-02-11', 450, now() - interval '40 days', null, now() - interval '40 days', null),
  ('fa000000-0000-4000-8000-000000000014', 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44', 'Nicolas Rezende', '550000000014', 'Limpeza e profilaxia', 'Limpeza periódica.', 'paciente_recorrente', now() - interval '100 days', now() - interval '90 days', 'FAKE', 'FAKE-14', 'FAKE-14', '0', '1983-06-27', 180, now() - interval '90 days', null, now() - interval '90 days', null),
  ('fa000000-0000-4000-8000-000000000015', 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44', 'Olivia Teixeira', '550000000015', 'Prótese sobre implante', 'Tratamento concluído; acompanhamento.', 'paciente_recorrente', now() - interval '30 days', now() - interval '20 days', 'FAKE', 'FAKE-15', 'FAKE-15', '0', '1967-11-30', 3200, now() - interval '20 days', null, now() - interval '20 days', null),
  ('fa000000-0000-4000-8000-000000000016', 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44', 'Paulo Batista', '550000000016', 'Limpeza e profilaxia', 'Retorno de manutenção.', 'retornar_3_meses', now() - interval '110 days', now() - interval '100 days', 'FAKE', 'FAKE-16', 'FAKE-16', '0', '1994-03-03', 180, now() - interval '100 days', now() + interval '20 days', now() - interval '100 days', null),
  ('fa000000-0000-4000-8000-000000000017', 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44', 'Renata Cardoso', '550000000017', 'Clareamento dental', 'Pediu para voltar em 6 meses.', 'retornar_6_meses', now() - interval '210 days', now() - interval '200 days', 'FAKE', 'FAKE-17', 'FAKE-17', '0', '1987-09-19', 600, now() - interval '200 days', now() + interval '60 days', now() - interval '200 days', null),
  ('fa000000-0000-4000-8000-000000000018', 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44', 'Sérgio Lopes', '550000000018', 'Tratamento de canal', 'Retorno anual para revisão.', 'retornar_1_ano', now() - interval '410 days', now() - interval '400 days', 'FAKE', 'FAKE-18', 'FAKE-18', '0', '1972-12-23', 900, now() - interval '400 days', now() + interval '200 days', now() - interval '400 days', null),
  ('fa000000-0000-4000-8000-000000000019', 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44', 'Tatiana Araújo', '550000000019', 'Avaliação ortodôntica', 'Retorno em 6 meses para ajuste.', 'retornar_6_meses', now() - interval '190 days', now() - interval '180 days', 'FAKE', 'FAKE-19', 'FAKE-19', '0', '2000-05-16', 150, now() - interval '180 days', now() + interval '10 days', now() - interval '180 days', null),
  ('fa000000-0000-4000-8000-000000000020', 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44', 'Vitor Monteiro', '550000000020', 'Faceta de porcelana', 'Pediu orçamento por WhatsApp.', 'conversando', now() - interval '2 days', now() - interval '1 day', 'FAKE', 'FAKE-20', 'FAKE-20', '0', '1997-07-07', null, null, null, null, null);

insert into public.consultas (id, lead_id, procedimento, data_consulta, status, valor_pago, observacoes) values
  ('fb000000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000007', 'Avaliação de faceta', now() + interval '2 days', 'agendada', null, null),
  ('fb000000-0000-4000-8000-000000000002', 'fa000000-0000-4000-8000-000000000008', 'Limpeza e profilaxia', now() + interval '5 days', 'agendada', null, null),
  ('fb000000-0000-4000-8000-000000000003', 'fa000000-0000-4000-8000-000000000009', 'Restauração em resina', now() + interval '1 day', 'agendada', null, null),
  ('fb000000-0000-4000-8000-000000000004', 'fa000000-0000-4000-8000-000000000010', 'Extração de siso', now() - interval '1 day', 'cancelada', null, 'Paciente cancelou por motivo pessoal.'),
  ('fb000000-0000-4000-8000-000000000005', 'fa000000-0000-4000-8000-000000000011', 'Avaliação odontológica geral', now() - interval '7 days', 'realizada', 150, 'Orçamento entregue.'),
  ('fb000000-0000-4000-8000-000000000006', 'fa000000-0000-4000-8000-000000000012', 'Avaliação de implante', now() - interval '10 days', 'realizada', 300, 'Tomografia solicitada.'),
  ('fb000000-0000-4000-8000-000000000007', 'fa000000-0000-4000-8000-000000000013', 'Clareamento dental', now() - interval '40 days', 'realizada', 450, null),
  ('fb000000-0000-4000-8000-000000000008', 'fa000000-0000-4000-8000-000000000014', 'Limpeza e profilaxia', now() - interval '90 days', 'realizada', 180, null),
  ('fb000000-0000-4000-8000-000000000009', 'fa000000-0000-4000-8000-000000000015', 'Prótese sobre implante', now() - interval '20 days', 'realizada', 3200, 'Instalação concluída.'),
  ('fb000000-0000-4000-8000-000000000010', 'fa000000-0000-4000-8000-000000000016', 'Limpeza e profilaxia', now() - interval '100 days', 'realizada', 180, null),
  ('fb000000-0000-4000-8000-000000000011', 'fa000000-0000-4000-8000-000000000017', 'Clareamento dental', now() - interval '200 days', 'realizada', 600, null),
  ('fb000000-0000-4000-8000-000000000012', 'fa000000-0000-4000-8000-000000000018', 'Tratamento de canal', now() - interval '400 days', 'realizada', 900, null),
  ('fb000000-0000-4000-8000-000000000013', 'fa000000-0000-4000-8000-000000000019', 'Avaliação ortodôntica', now() - interval '180 days', 'realizada', 150, null);

alter table public.consultas enable trigger trg_marca_lead_recorrente;

-- Conferência: deve retornar 20 leads no total (13 consultas: 3 agendadas, 1 cancelada, 9 realizadas)
select status, count(*) as leads
from public.leads_clinica
where id_conta_chatwoot = 'FAKE' and clinica_id = 'dfd4c0c3-56cf-488d-a75d-7e6e0a6a3e44'
group by status
order by status;

commit;
