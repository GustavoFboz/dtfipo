# Plano de Correção: Carregamento do Perfil do Paciente

O usuário relatou que ao clicar em um paciente na listagem, a página de detalhes não carrega ou fica travada. Meus diagnósticos indicam que o problema pode estar relacionado a permissões de acesso (RLS) ou falhas silenciosas no carregamento de componentes dependentes.

## Alterações Propostas

### 1. Robustez no Carregamento de Dados (`src/lib/api.ts`)
- Adicionar logs detalhados em `fetchPatient` e `fetchPatientCases` para capturar erros do Supabase.
- Garantir que a busca de pacientes não falhe silenciosamente se o usuário for um `SOLICITANTE`.

### 2. Melhorias na Página de Detalhes (`src/routes/_authenticated/patients.$id.tsx`)
- Implementar tratamento de erro robusto com mensagens amigáveis caso o paciente não seja encontrado ou haja erro de rede.
- Adicionar logs de depuração no `FloatingLog` para que o usuário possa ver o que está acontecendo em tempo real.
- Garantir que o componente não trave se partes dos dados (como fotos ou anexos) falharem.

### 3. Ajustes de Navegação
- Verificar e corrigir possíveis loops de redirecionamento no `AppShell` que afetem rotas de detalhes.

## Detalhes Técnicos
- Refatoração de `useQuery` para incluir estados de erro.
- Verificação de políticas de RLS para garantir que a clínica correta seja acessada.
- Adição de `try/catch` em funções críticas da API.

---
Vou prosseguir com a implementação destas melhorias para garantir que o perfil do paciente carregue perfeitamente.
