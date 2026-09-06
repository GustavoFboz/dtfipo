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
Supabase               SQLite (futuro)
    |                      |
    |------ Sync Engine ---|
```

Isso permite manter a mesma experiência de Clínica, Laboratório e Radiologia em diferentes plataformas sem duplicar o frontend.

## Fase 1 — Fundação Desktop (atual)

- Tauri v2 dentro deste repositório (`src-tauri/`).
- Build SPA separado (`vite.desktop.config.ts`) sem alterar o build web de produção.
- Instalador Windows NSIS gerado por GitHub Actions.
- Frontend incorporado ao executável.
- Supabase continua sendo a fonte de dados nesta fase.
- Indicador universal Online / Offline / Atualizando.
- Quando a conexão retorna, o app atualiza queries ativas e apresenta uma transição visual curta.

> Nesta fase, `Offline` significa que o aplicativo detectou ausência de rede. Ainda não significa que todas as telas possuem dados locais persistidos.

## Fase 2 — Banco local

Adicionar SQLite ao Tauri e uma camada local com escopo por conta/usuário. Inicialmente, persistir somente dados necessários para consulta offline, por exemplo:

- perfil e configurações essenciais;
- pacientes permitidos ao usuário;
- agenda recente/próxima;
- casos e etapas relevantes;
- estoque necessário à operação;
- prontuário e anexos com política explícita de cache.

Dados clínicos locais devem ser tratados como dados sensíveis: menor escopo possível, proteção por sessão e estratégia de criptografia/limpeza do dispositivo.

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

## Limitação conhecida da primeira amostra

Algumas funções administrativas atuais usam `createServerFn` do TanStack Start e dependem do backend web do DentalFlow. Elas precisam ser migradas para endpoints remotos explícitos ou adaptadores próprios antes de serem consideradas totalmente compatíveis com um frontend 100% embarcado/offline.

Isso não bloqueia a fundação do executável, mas é uma tarefa obrigatória antes da versão Desktop final.

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
