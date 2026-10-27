import { describe, it, expect } from 'vitest'
import { proximosAniversarios, renderizarMensagem, type LeadAniversario } from './aniversario'

const hoje = { y: 2026, m: 10, d: 23 }

function lead(id: string, nome: string, nascimento: string, enviado: string | null = null): LeadAniversario {
  return { id, nome_lead: nome, whatsapp_lead: '550000000000', data_nascimento: nascimento, ultimo_aniversario_enviado: enviado }
}

describe('proximosAniversarios', () => {
  it('inclui hoje e os próximos 7 dias, e ignora quem passa disso', () => {
    const r = proximosAniversarios([
      lead('a', 'Hoje', '1990-10-23'),
      lead('b', 'Em 7 dias', '1985-10-30'),
      lead('c', 'Em 8 dias', '1985-10-31'),
      lead('d', 'Ontem', '1985-10-22'),
    ], hoje)
    expect(r.map(x => x.nome)).toEqual(['Hoje', 'Em 7 dias'])
    expect(r.map(x => x.diasAte)).toEqual([0, 7])
  })

  it('calcula a idade que a pessoa completa', () => {
    const [r] = proximosAniversarios([lead('a', 'Maria', '1990-10-25')], hoje)
    expect(r.idade).toBe(36)
    expect(r.diaMes).toBe('25/10')
  })

  it('aniversário que já passou neste ano cai no ano seguinte', () => {
    const [r] = proximosAniversarios([lead('a', 'Ana', '1990-01-05')], hoje, 365)
    expect(r.diasAte).toBe(74)
    expect(r.idade).toBe(37)
  })

  it('virada de ano: dezembro/janeiro são contados certo', () => {
    const r = proximosAniversarios([lead('a', 'Bia', '2000-01-02')], { y: 2026, m: 12, d: 28 })
    expect(r[0].diasAte).toBe(5)
  })

  it('status hoje: pendente se não enviada, enviada se já marcada neste ano', () => {
    const r = proximosAniversarios([
      lead('a', 'Pendente', '1990-10-23'),
      lead('b', 'Enviada', '1990-10-23', '2026-10-23'),
      lead('c', 'Enviada ano passado', '1990-10-23', '2025-10-23'),
    ], hoje)
    const status = Object.fromEntries(r.map(x => [x.nome, x.status]))
    expect(status).toEqual({
      'Pendente': 'pendente',
      'Enviada': 'enviada',
      'Enviada ano passado': 'pendente',
    })
  })

  it('dias futuros ficam como agendada, mesmo que tenham envio marcado', () => {
    const [r] = proximosAniversarios([lead('a', 'Futuro', '1990-10-26', '2025-10-26')], hoje)
    expect(r.status).toBe('agendada')
  })

  it('29/02 em ano não bissexto cai em 28/02', () => {
    const r = proximosAniversarios([lead('a', 'Bissexto', '2000-02-29')], { y: 2026, m: 2, d: 25 })
    expect(r[0].diasAte).toBe(3)
  })

  it('ignora datas inválidas e ordena por proximidade', () => {
    const r = proximosAniversarios([
      lead('a', 'Zeta', '1990-10-25'),
      lead('b', 'Alfa', '1990-10-25'),
      lead('c', 'Inválido', '') ,
    ], hoje)
    expect(r.map(x => x.nome)).toEqual(['Alfa', 'Zeta'])
  })
})

describe('renderizarMensagem', () => {
  const template = 'Olá {nome}! A equipe da {clinica} deseja um feliz aniversário!'

  it('troca as duas variáveis com os dados do tenant', () => {
    expect(renderizarMensagem(template, { nome: 'Maria Silva', clinica: 'Clínica Alfa' }))
      .toBe('Olá Maria! A equipe da Clínica Alfa deseja um feliz aniversário!')
  })

  it('troca todas as ocorrências da variável', () => {
    expect(renderizarMensagem('{nome}, {nome} e {clinica}, {clinica}', { nome: 'Ana', clinica: 'Beta' }))
      .toBe('Ana, Ana e Beta, Beta')
  })

  it('usa os textos de reserva quando falta nome ou nome da clínica', () => {
    expect(renderizarMensagem('Olá {nome} da {clinica}', { nome: '  ', clinica: null }))
      .toBe('Olá cliente da nossa clínica')
  })
})
