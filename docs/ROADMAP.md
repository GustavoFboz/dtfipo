# Dental Flow — Roadmap técnico e ideias

Este arquivo registra melhorias que **não devem ser implementadas de forma improvisada no `main`**. A regra de trabalho é: desenvolver em branch separada, validar build/testes e revisão, e só então fazer merge.

## Impressão

### Bridge/agent local para impressão silenciosa e direta
**Status:** futuro / não implementar neste pacote de estabilização.

Criar um pequeno agente local do Dental Flow instalado no computador da clínica/laboratório para permitir impressão realmente direta em impressoras USB/sistema, sem depender da janela de impressão do navegador.

Objetivos:
- detectar impressoras instaladas no Windows/macOS;
- permitir selecionar e salvar uma impressora padrão por estação;
- enviar a ficha diretamente para a impressora;
- suportar impressoras térmicas/etiquetas e impressoras comuns via driver do sistema;
- manter perfis de DPI, largura e papel;
- ter comunicação autenticada entre o Dental Flow web e o agente local;
- não expor uma porta local sem autenticação;
- oferecer fallback seguro para impressão normal do navegador quando o agente não estiver disponível.

Observação: Web Bluetooth pode continuar existindo como alternativa para dispositivos compatíveis. O bridge local é a solução futura para impressão USB/sistema verdadeiramente silenciosa.

## Segurança e arquitetura

- Continuar auditando qualquer uso de Supabase Broadcast para garantir que dados clínicos completos nunca sejam enviados por canais públicos; preferir Postgres Realtime protegido por RLS ou eventos destinados a um usuário.
- Manter `account_subtype`/tipo efetivo como fonte de autorização quando houver perfil base diferente do tipo operacional.
- Para novas funcionalidades de caso, garantir isolamento por participação/responsabilidade e testar remoção de acesso em tempo real.

## Qualidade

- Adicionar testes automatizados de RLS para CEO/Admin, Protético responsável, Cadista, Dentista e Solicitante.
- Adicionar testes de regressão do workflow condicional (Mockup e Provisório).
- Adicionar testes de retorno de etapa e reabertura do histórico.
- Adicionar teste de download ZIP com falha parcial de anexos.
- Adicionar teste de criação de caso com vários anexos verificando que apenas uma notificação agregada é criada.
