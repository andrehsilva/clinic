import { useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { resolverFunil } from '../lib/funil'

/**
 * Funil da clínica logada, derivado de funil_etapas (com fallback no gabarito),
 * já com as etapas dobradas aplicadas.
 * - visiveis: colunas do board/seletor, em ordem
 * - ocultas: etapas dobradas em outra coluna (só a tela de configuração as lista)
 * - labels: chave técnica -> rótulo da coluna onde ela aparece
 * - exigeConsulta: chaves que só avançam com consulta realizada
 * - pacienteKeys: chaves que entram na aba "Pacientes"
 * - statusExibido: chave do lead -> chave da coluna onde ele aparece
 */
export function useFunil() {
  const { etapas } = useAuth()
  return useMemo(() => resolverFunil(etapas), [etapas])
}
