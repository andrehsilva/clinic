-- 022: a coluna do paciente que já fez consulta passa a se chamar "Reagendado";
-- "Paciente Ativo" deixa de ser etapa e vira tag do cliente.
--
-- A chave técnica continua sendo paciente_recorrente (é ela que o trigger da
-- migration 006/016 grava quando uma consulta vira 'realizada', e é ela que a
-- classificação de retorno usa). Só o rótulo muda: o lead que acabou de sair da
-- consulta e ainda precisa marcar a próxima fica em "Reagendado"; quando a nova
-- consulta agendada é criada, o trigger de sincronização leva o lead para
-- "Avaliação Agendada".
--
-- A tag "Paciente ativo" é derivada do histórico (data_virou_recorrente
-- preenchida), não do status — por isso não é coluna.
--
-- Não aplicar sem revisão. Rodar no SQL Editor do Supabase, em uma transação.

begin;

-- Gabarito: mesmo funil, rótulo novo na etapa de paciente
create or replace function public.gabarito_funil(p_nicho text)
returns table (chave text, rotulo text, ordem integer, exige_consulta_realizada boolean, e_paciente boolean)
language sql
immutable
set search_path = public
as $$
  with g(nicho, chave, rotulo, ordem) as (values
    ('estetica','iniciou_conversa','Iniciou Conversa',1),
    ('estetica','conversando','Conversando',2),
    ('estetica','follow_up_1_feito','Reengajamento',3),
    ('estetica','follow_up_2_feito','Reengajamento 2',4),
    ('estetica','consulta_agendada','Consulta Agendada',5),
    ('estetica','follow_up_3_feito','Confirmação de Consulta',6),
    ('estetica','consulta_cancelada','Consulta Cancelada',7),
    ('estetica','consulta_realizada','Consulta Realizada',8),
    ('estetica','paciente_recorrente','Reagendado',9),
    ('estetica','retornar_3_meses','Retorno',10),
    ('estetica','retornar_6_meses','Retorno 6 meses',11),
    ('estetica','retornar_1_ano','Retorno 1 ano',12),
    ('medica','iniciou_conversa','Novo Contato',1),
    ('medica','conversando','Em Atendimento',2),
    ('medica','follow_up_1_feito','Reengajamento',3),
    ('medica','follow_up_2_feito','Reengajamento 2',4),
    ('medica','consulta_agendada','Consulta Agendada',5),
    ('medica','follow_up_3_feito','Confirmação de Consulta',6),
    ('medica','consulta_cancelada','Consulta Cancelada',7),
    ('medica','consulta_realizada','Consulta Realizada',8),
    ('medica','paciente_recorrente','Reagendado',9),
    ('medica','retornar_3_meses','Retorno',10),
    ('medica','retornar_6_meses','Retorno 6 meses',11),
    ('medica','retornar_1_ano','Retorno 1 ano',12),
    ('odontologica','iniciou_conversa','Novo Contato',1),
    ('odontologica','conversando','Orçamento em Negociação',2),
    ('odontologica','follow_up_1_feito','Reengajamento',3),
    ('odontologica','follow_up_2_feito','Reengajamento 2',4),
    ('odontologica','consulta_agendada','Avaliação Agendada',5),
    ('odontologica','follow_up_3_feito','Confirmação de Avaliação',6),
    ('odontologica','consulta_cancelada','Avaliação Cancelada',7),
    ('odontologica','consulta_realizada','Avaliação Realizada',8),
    ('odontologica','paciente_recorrente','Reagendado',9),
    ('odontologica','retornar_3_meses','Retorno',10),
    ('odontologica','retornar_6_meses','Retorno 6 meses',11),
    ('odontologica','retornar_1_ano','Retorno 1 ano',12),
    ('generico','iniciou_conversa','Novo Contato',1),
    ('generico','conversando','Em Conversa',2),
    ('generico','follow_up_1_feito','Reengajamento',3),
    ('generico','follow_up_2_feito','Reengajamento 2',4),
    ('generico','consulta_agendada','Agendado',5),
    ('generico','follow_up_3_feito','Confirmação',6),
    ('generico','consulta_cancelada','Cancelado',7),
    ('generico','consulta_realizada','Concluído',8),
    ('generico','paciente_recorrente','Reagendado',9),
    ('generico','retornar_3_meses','Retorno',10),
    ('generico','retornar_6_meses','Retorno 6 meses',11),
    ('generico','retornar_1_ano','Retorno 1 ano',12)
  )
  select g.chave, g.rotulo, g.ordem,
         g.chave in ('consulta_realizada','paciente_recorrente','retornar_3_meses','retornar_6_meses','retornar_1_ano'),
         g.chave in ('consulta_realizada','paciente_recorrente','retornar_3_meses','retornar_6_meses','retornar_1_ano')
  from g
  where g.nicho = p_nicho
  order by g.ordem
$$;

-- Clínicas existentes: só troca quem ainda está com o rótulo do gabarito
-- (nome personalizado continua valendo).
update public.funil_etapas
set rotulo = 'Reagendado'
where chave = 'paciente_recorrente'
  and rotulo in ('Paciente Recorrente', 'Paciente Ativo', 'Cliente Recorrente');

commit;
