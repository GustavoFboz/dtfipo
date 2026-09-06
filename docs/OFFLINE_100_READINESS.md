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
| Pacientes | Sim | Sim | Sim | primeira implementação |
| Contexto/permissões da Clínica | Sim | n/a | atualização online | implementado |
| Agenda da Clínica | Sim | Sim | Sim | implementado nesta etapa |
| Perfil e cadastros auxiliares | Sim | não aplicável em vários fluxos | atualização online | implementado nesta etapa |
| Casos do Laboratório | Sim | Ainda não | Ainda não | leitura implementada nesta etapa |
| Financeiro da Clínica | Ainda não completo | Ainda não | Ainda não | próximo |
| Evoluções/prontuário | Ainda não completo | Ainda não | Ainda não | próximo |
| Estoque | Ainda não completo | Ainda não | Ainda não | próximo |
| Etapas/alterações de casos | leitura parcial | Ainda não | Ainda não | próximo |
| Notificações | Não | Não | Não | pendente |
| Anexos/imagens/arquivos | metadados não bastam | Não | Não | pendente |
| Autenticação após reinício sem internet | depende da sessão persistida | n/a | n/a | precisa de cofre local/offline unlock |
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

## Ordem de implementação restante

### 1. Sessão e identidade offline

- provisionar o dispositivo após login online válido;
- armazenar somente o necessário para identificar o usuário/tenant local;
- criar desbloqueio offline seguro (PIN/segredo local ou integração com o cofre do Windows);
- definir validade máxima da autorização offline;
- impedir troca de `owner_id` por manipulação do frontend;
- limpeza segura ao remover dispositivo/conta.

**Não** será considerado aceitável simplesmente ignorar o Supabase Auth quando estiver offline.

### 2. Clínica completa

- financeiro local-first;
- evoluções/prontuário local-first;
- configurações necessárias para operação;
- equipe/permissões em modo de consulta offline;
- dashboard calculado preferencialmente a partir dos datasets locais.

### 3. Laboratório completo

- criação de caso offline;
- edição de caso;
- transições de etapa;
- atribuições;
- componentes e fluxos;
- conclusão/reabertura/arquivamento;
- comentários importantes e eventos do caso.

Operações que dependem de vários registros devem entrar na outbox como uma unidade lógica ou transação reexecutável.

### 4. Estoque

- snapshot local de itens e movimentos;
- entradas/saídas offline;
- reserva/consumo relacionado a casos;
- regra explícita de conflito para quantidade divergente.

Estoque é um dos domínios em que `last write wins` não é aceitável.

### 5. Arquivos e imagens

Arquivos não podem depender somente de URLs Supabase Storage.

- baixar sob demanda ou por política de sincronização;
- diretório local controlado pelo Tauri;
- índice SQLite de arquivos presentes localmente;
- fila de upload para novos anexos offline;
- limites de armazenamento e limpeza;
- hash para integridade/duplicidade.

### 6. Sync Engine v2

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

### 7. Segurança para produção

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
