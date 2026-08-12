# Plano de Estabilização e Design da Página de Detalhes do Paciente

O objetivo é corrigir a navegação que está falhando (URL muda mas o conteúdo não carrega) e redesenhar a página de detalhes do paciente para seguir a nova identidade visual "clean" e minimalista do sistema, incluindo a visualização completa de casos e anexos.

## Melhorias Técnicas
- **Correção da Navegação:** Garantir que o componente `PatientDetailPage` reaja corretamente às mudanças no parâmetro `$id` e que o roteador não entre em loops ou estados de congelamento.
- **Log de Diagnóstico:** Implementar um log mais técnico no `FloatingLog` para capturar falhas de carregamento e erros de renderização em tempo real.

## Redesign Visual (Identidade DentalFlow)
- **Cabeçalho:** Header flutuante ou minimalista com foto do paciente (via `PatientPhotoUpload`) e informações essenciais.
- **Estrutura de Seções:** Uso de divisores sutis e tipografia leve (SF Pro Display).
- **Listagem de Casos:** Visual de "cards clean" alinhados à esquerda, mas ocupando toda a largura, diferenciando casos ativos de finalizados/arquivados.
- **Anexos:** Galeria de anexos integrada com o mesmo estilo visual.

## Detalhes Técnicos (Para Desenvolvedores)
- **Sincronização de Estado:** Uso de `useQuery` com `staleTime: 0` para garantir dados frescos.
- **Roteamento:** Uso de `useNavigate` e `Link` do TanStack Router de forma consistente.
- **Performance:** Evitar re-renders desnecessários e garantir que o carregamento inicial não bloqueie a UI.

## Ações Práticas
1. Ajustar `src/routes/_authenticated/patients.$id.tsx` com o novo design e lógica de carregamento.
2. Atualizar `src/routes/_authenticated/patients.tsx` para garantir que o link de navegação use o método mais estável.
3. Refinar o `FloatingLog` para ser uma ferramenta útil de captura de bugs em vez de apenas texto estático.
