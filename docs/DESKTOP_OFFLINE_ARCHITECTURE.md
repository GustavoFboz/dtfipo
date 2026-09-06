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
- Supabase continua sendo a fonte de dados nesta fase.
- Indicador universal Online / Offline / Atualizando.
- Quando a conexão retorna, o app atualiza queries ativas e apresenta uma transição visual curta.

O primeiro build Windows validado foi gerado no workflow `DentalFlow Windows Desktop` e contém o executável portátil e o instalador NSIS.

## Fase 2 — Banco local (fundação iniciada)

O Tauri agora inicializa um SQLite real em `app_data_dir/dentalflow.sqlite3`, com `WAL`, `foreign_keys` e schema versionado. Essa camada ainda não substitui o Supabase: ela passa a ser a fundação local para consulta offline e sincronização incremental.

Estruturas já disponíveis:

- `local_cache`: armazenamento JSON por usuário, namespace e chave;
- `outbox`: fila local de escritas pendentes com entidade, operação, payload, versão-base, tentativas e estado;
- `local_meta`: metadados do schema local;
- comandos Tauri tipados para leitura/gravação do cache e gerenciamento da outbox;
- bridge TypeScript `src/lib/desktop-local.ts`, invisível no Web e ativa somente dentro do Tauri.

O cache é deliberadamente escopado por `owner_id` para impedir que uma sessão hidrate dados pertencentes a outra identidade. O próximo passo é integrar repositórios específicos — começando por perfil, pacientes, agenda e casos — em vez de persistir indiscriminadamente todo o React Query.

Dados clínicos locais são dados sensíveis. Antes de considerar o modo offline final, ainda são obrigatórios: política explícita de retenção, limpeza do dispositivo, proteção por sessão e criptografia adequada do conteúdo persistido.

## Fase 3 — Sync Engine

Toda escrita offline entra em uma `outbox` local com identificador, entidade, operação, payload, versão e horário.

Estados de UX previstos:

- `Sincronizado`
- `Offline`
- `Alterações pendentes`
- `Sincronizando`
- `Conflito`

Ao recuperar conexão:

1. autenticação/sessão é validada;
2. outbox local é enviada;
3. conflitos são resolvidos por política da entidade;
4. alterações remotas novas são baixadas;
5. cache local é atualizado;
6. somente então a UI volta para `Online`.

Conflitos de agenda e prontuário não devem ser resolvidos silenciosamente quando houver risco de perda de informação.

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

## Limitação conhecida

Algumas funções administrativas atuais usam `createServerFn` do TanStack Start e dependem do backend web do DentalFlow. Elas precisam ser migradas para endpoints remotos explícitos ou adaptadores próprios antes de serem consideradas totalmente compatíveis com um frontend 100% embarcado/offline.

O SQLite local também não significa, sozinho, que o aplicativo já pode autenticar e operar indefinidamente sem internet. A sessão offline, a hidratação dos repositórios permitidos e a execução da outbox ainda serão implementadas progressivamente.

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
