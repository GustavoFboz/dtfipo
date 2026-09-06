# DentalFlow Desktop — caminho para operação 100% offline

Este documento é o checklist técnico de aceitação. O objetivo não é apenas abrir o `.exe` sem internet: é permitir que Clínica, Laboratório e, futuramente, Radiologia continuem utilizáveis com dados locais consistentes e sincronizem de forma segura quando a conexão retornar.

## Definição de “100% offline”

O Desktop será considerado offline-ready quando, após uma sincronização online inicial, o usuário puder desligar totalmente a internet, reiniciar o computador e continuar trabalhando nos recursos autorizados sem telas quebradas ou chamadas obrigatórias à nuvem.

### Critério de teste final

1. Login/provisionamento inicial com internet.
2. Sincronização local completa.
3. Encerrar o DentalFlow.
4. Desligar Wi‑Fi/cabo.
5. Reiniciar o Windows.
6. Abrir o DentalFlow.
7. Navegar por Clínica e Laboratório.
8. Consultar e editar dados permitidos offline.
9. Criar novas operações locais.
10. Fechar e abrir novamente ainda offline.
11. Restaurar internet.
12. Sincronizar sem perda ou duplicação de dados.
13. Exibir conflitos que não possam ser resolvidos automaticamente.

## Estado atual

| Domínio | Consulta offline | Escrita offline | Sync/outbox | Situação |
|---|---:|---:|---:|---|
| Shell/Tauri | Sim | n/a | n/a | pronto |
| SQLite local | Sim | Sim | Sim | pronto |
| Pacientes | Sim | Sim | Sim | implementado, requer bateria final de conflito |
| Contexto/permissões da Clínica | Sim | leitura | atualização online | implementado |
| Agenda da Clínica | Sim | Sim | Sim | implementado |
| Perfil e cadastros auxiliares | Sim | parcial | atualização online | implementado para os datasets essenciais |
| Casos do Laboratório | Sim | Ainda não | Ainda não | leitura offline implementada |
| Financeiro da Clínica | Sim | Sim | Sim | primeira implementação local-first |
| Evoluções/prontuário | Sim | Sim | Sim | primeira implementação local-first |
| Dashboard clínico | Sim para datasets migrados | n/a | atualização online | estoque baixo e tratamentos ativos cacheados |
| Estoque atual (`stock-v2`) | Sim | Sim para CRUD/ajustes | Sim | primeira implementação local-first |
| Estoque legado | Sim | Sim para CRUD/movimentos manuais | Sim | primeira implementação local-first |
| Consumo automático ligado ao caso | Parcial | Ainda não seguro | Ainda não | bloqueador de estoque 100% offline |
| Etapas/alterações de casos | leitura parcial | Ainda não | Ainda não | próximo grande bloco |
| Notificações | Não completo | Não | Não | pendente |
| Equipe/admin server-side | Parcial | Não completo | Não completo | funções server-only precisam de adapter |
| Anexos/imagens/arquivos | metadados não bastam | Não | Não | pendente |
| Identidade após reinício sem internet | provisionamento finito iniciado | n/a | revalidação ao reconectar | fundação implementada, cofre/segredo local ainda obrigatório |
| Criptografia do banco local | Não final | n/a | n/a | obrigatório antes de produção |
| Atualizações do app | n/a | n/a | n/a | pendente |

## Arquitetura obrigatória

```text
DentalFlow UI
     |
     v
Facades locais (mesmas imports usadas pela UI)
     |
     +--------------------+
     |                    |
     v                    v
SQLite / local cache     Supabase
     |                    |
     +------ Sync Engine -+
              |
              v
        conflitos / outbox
```

A UI não deve decidir se está online ou offline. Cada domínio possui um repositório local-first. O build Web continua usando os módulos cloud existentes; o build Tauri troca apenas as facades por aliases do Vite.

## Identidade offline do dispositivo

O Desktop agora provisiona uma identidade mínima somente depois de uma sessão online válida e estabelece uma validade offline finita de 14 dias. Isso permite estruturar a reabertura do aplicativo sem depender de uma chamada imediata à nuvem.

Esta fundação **não é a segurança final**: o arquivo de provisionamento ainda precisa ser protegido por um segredo local/Windows Credential Manager ou DPAPI. Antes de produção, o usuário também deverá desbloquear o modo offline de forma segura. Não será aceito simplesmente ignorar o Supabase Auth quando estiver offline.

## Ordem de implementação restante

### 1. Fechar sessão e identidade offline

- usar a identidade provisionada como fonte de `owner_id` em todos os adapters quando a sessão Supabase estiver indisponível;
- criar desbloqueio offline seguro (PIN/segredo local ou integração com o cofre do Windows);
- proteger a credencial/chave com DPAPI/credential vault;
- definir política administrativa para prazo offline;
- impedir troca de `owner_id` por manipulação do frontend;
- limpeza segura ao remover dispositivo/conta.

### 2. Laboratório completo

- criação de caso offline;
- edição de caso;
- transições de etapa;
- atribuições;
- componentes e fluxos;
- conclusão/reabertura/arquivamento;
- comentários importantes e eventos do caso.

Operações que dependem de vários registros devem entrar na outbox como uma unidade lógica ou transação reexecutável.

### 3. Estoque — fechar transações críticas

- consumo/reversão automática relacionado a casos;
- política explícita de conflito de quantidade;
- atomicidade entre caso + movimento de estoque;
- validar custom fields e vínculos de implante em cenários de conflito.

Estoque é um dos domínios em que `last write wins` não é aceitável.

### 4. Clínica — fechar superfícies restantes

- equipe em modo de consulta offline;
- configurações realmente necessárias à operação;
- demais datasets de dashboard;
- validar financeiro/evoluções com conflitos e múltiplos dispositivos.

### 5. Arquivos e imagens

Arquivos não podem depender somente de URLs Supabase Storage.

- baixar sob demanda ou por política de sincronização;
- diretório local controlado pelo Tauri;
- índice SQLite de arquivos presentes localmente;
- fila de upload para novos anexos offline;
- limites de armazenamento e limpeza;
- hash para integridade/duplicidade.

### 6. Notificações, mensagens e funções server-only

- cache local das notificações úteis;
- fila local para ações que possam ser feitas offline;
- substituir dependências indispensáveis de `createServerFn` por adapters remotos explícitos ou operações locais sincronizáveis;
- não tentar simular localmente ações administrativas que exigem autoridade do servidor.

### 7. Sync Engine v2

O coordenador atual é incremental. A versão final precisa de:

- cursor/`updated_at` por dataset;
- push da outbox antes do pull remoto;
- idempotência;
- retry com backoff;
- dependências entre operações;
- conflitos por entidade;
- log de sincronização auditável;
- botão de sincronização manual;
- estado global: Sincronizado / Offline / Pendências / Sincronizando / Conflito.

### 8. Segurança para produção

- banco local criptografado ou conteúdo sensível criptografado;
- chave protegida pelo Windows (DPAPI/credential vault quando aplicável);
- CSP do Tauri restritivo;
- remover APIs globais desnecessárias;
- capabilities mínimas;
- assinatura digital do executável;
- auditoria de dependências;
- política de retenção e exclusão local.

## Estratégia de migração

Cada domínio deve passar pelo mesmo ciclo:

1. criar adapter local-first;
2. cachear snapshot online;
3. permitir leitura offline;
4. implementar escrita local;
5. adicionar outbox;
6. implementar sincronização;
7. implementar conflito;
8. adicionar teste de regressão;
9. somente então marcar domínio como offline-ready.

Assim o DentalFlow pode evoluir sem reescrever a interface e sem comprometer a versão Web.
