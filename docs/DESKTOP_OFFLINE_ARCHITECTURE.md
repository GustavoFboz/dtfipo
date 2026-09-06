# DentalFlow Desktop & Offline

## Objetivo

A versão Desktop usa a mesma base de produto do DentalFlow Web. O executável Tauri incorpora o frontend localmente e adiciona, por etapas, capacidades nativas e uma camada de dados offline. Não existe um segundo produto ou um segundo repositório.

## Regra de arquitetura

As telas do DentalFlow devem consumir serviços/repositórios de dados, e não decidir se estão rodando na Web, no Windows ou futuramente no Android/iOS.

```text
UI DentalFlow
    |
    v
Data / Platform Layer
    |----------------------|
    v                      v
Cloud adapter          Local adapter
Supabase               SQLite
    |                      |
    |------ Sync Engine ---|
```

Isso permite manter a mesma experiência de Clínica, Laboratório e Radiologia em diferentes plataformas sem duplicar o frontend.

## Fase 1 — Fundação Desktop

- Tauri v2 dentro deste repositório (`src-tauri/`).
- Build SPA separado (`vite.desktop.config.ts`) sem alterar o build web de produção.
- Instalador Windows NSIS gerado por GitHub Actions.
- Frontend incorporado ao executável.
- Supabase continua sendo a fonte remota de dados.
- Indicador universal Online / Offline / Sincronizando.
- Quando a conexão retorna, o app aguarda a sincronização local e depois atualiza as queries ativas, apresentando uma transição visual curta.

O primeiro build Windows validado foi gerado no workflow `DentalFlow Windows Desktop` e contém o executável portátil e o instalador NSIS.

## Fase 2 — Banco local (em implementação)

O Tauri inicializa um SQLite real em `app_data_dir/dentalflow.sqlite3`, com `WAL`, `foreign_keys` e schema versionado. Essa camada não substitui o Supabase: ela funciona como base local para consulta offline e sincronização incremental.

Estruturas disponíveis:

- `local_cache`: armazenamento JSON por usuário, namespace e chave;
- `outbox`: fila local de escritas pendentes com entidade, operação, payload, versão-base, tentativas e estado;
- `local_meta`: metadados do schema local;
- comandos Tauri tipados para leitura/gravação do cache e gerenciamento da outbox;
- bridge TypeScript `src/lib/desktop-local.ts`, invisível no Web e ativa somente dentro do Tauri.

### Primeiro repositório local-first: Pacientes

Pacientes já são o primeiro domínio conectado à arquitetura local-first no Desktop:

- ao abrir com internet, a lista central de pacientes é baixada do Supabase e persistida no SQLite;
- cada paciente também é armazenado individualmente para permitir abertura de detalhe sem rede;
- ao ficar offline, as leituras passam a usar o cache local do usuário;
- criação, edição e exclusão básicas podem ser registradas localmente e entram na `outbox`;
- o mesmo cadastro central é reutilizado por Clínica e Laboratório;
- o build Desktop usa uma facade (`api.desktop.ts`) para redirecionar as leituras existentes de `fetchPatients` e `fetchPatient` ao adaptador local-first sem duplicar as telas;
- o Web continua usando o comportamento normal de nuvem.

O cache é deliberadamente escopado por `owner_id` para impedir que uma sessão hidrate dados pertencentes a outra identidade.

Dados clínicos locais são dados sensíveis. Antes de considerar o modo offline final, ainda são obrigatórios: política explícita de retenção, limpeza do dispositivo, proteção por sessão e criptografia adequada do conteúdo persistido.

## Fase 3 — Sync Engine (primeiro domínio ativo)

Toda escrita offline entra em uma `outbox` local com identificador, entidade, operação, payload, versão e horário.

Para **Pacientes**, o primeiro ciclo de sincronização já existe: ao recuperar conexão, o Desktop processa criações, edições e exclusões pendentes, atualiza o cache local e somente depois volta ao estado visual Online. O coordenador foi estruturado para receber Agenda, Casos e Estoque nas próximas etapas.

Estados de UX previstos/ativos progressivamente:

- `Sincronizado`
- `Offline`
- `Alterações pendentes`
- `Sincronizando`
- `Conflito`

Fluxo de retorno da conexão:

1. autenticação/sessão é validada;
2. outbox local é enviada;
3. conflitos são registrados por política da entidade;
4. alterações remotas novas são baixadas;
5. cache local é atualizado;
6. somente então a UI volta para `Online`.

Conflitos de agenda e prontuário não devem ser resolvidos silenciosamente quando houver risco de perda de informação.

## Próximos repositórios local-first

Ordem recomendada após Pacientes:

1. perfil e configurações essenciais;
2. agenda e agendamentos;
3. casos e etapas essenciais do laboratório;
4. estoque e alertas operacionais;
5. prontuário/evoluções;
6. anexos selecionados, com política explícita de cache e limites de armazenamento.

## Fase 4 — Recursos nativos

A camada Tauri será usada para capacidades que o navegador não entrega de forma confiável:

- impressão direta/silenciosa;
- impressoras USB e do sistema;
- acesso controlado a arquivos e pastas locais;
- scanners e integrações de hardware quando aplicável;
- atualizações do aplicativo;
- notificações nativas.

## Fase 5 — Android e iOS

Depois que a camada de dados estiver desacoplada do Supabase direto, a mesma base do frontend pode ganhar um shell Capacitor para Android/iOS. Tauri e Capacitor são shells diferentes; a UI e a camada de negócio permanecem compartilhadas sempre que possível.

## Limitações conhecidas

Algumas funções administrativas atuais usam `createServerFn` do TanStack Start e dependem do backend web do DentalFlow. Elas precisam ser migradas para endpoints remotos explícitos ou adaptadores próprios antes de serem consideradas totalmente compatíveis com um frontend 100% embarcado/offline.

Também ainda não consideramos todo o DentalFlow offline. Pacientes é o primeiro domínio local-first; Agenda, Casos, Estoque, prontuário, anexos e parte das funções administrativas ainda dependem da nuvem e serão migrados de forma incremental.

## Builds

### Desenvolvimento local

```bash
bun run desktop:dev
```

### Windows release

```bash
bun run desktop:build
```

O workflow `DentalFlow Windows Desktop` gera e armazena o executável e o instalador NSIS como artifact `DentalFlow-Windows`.
