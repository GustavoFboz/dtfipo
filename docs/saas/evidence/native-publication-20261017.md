# Publicação Web / Windows 0.6.8 / Android 0.3.1

Base conectada: `52ae867325dfc95aa30eb24c93554864f99f8da4`, após os aceites
reais de cobrança e arquivos. Contador preservado: **5/23 — 21,74%; 0/7 etapas
inteiras encerradas**. Empacotar aplicativos não atribui novos aceites financeiros
ou de aparelhos. A branch main é preservada.

## Correção compartilhada

O backend não aceitava `http://tauri.localhost` (Windows Tauri v2) ou
`https://localhost` (Android configurado no Capacitor). Checkout, renovação,
documentos e cancelamento compartilham essa barreira de origem. O ajuste aceita
somente as origens instaladas exatas, sem wildcard, sem cookie credenciado e
sem substituir JWT, vínculo de empresa ou MFA nas ações Master.

Referências primárias: [origem Tauri no Windows](https://v2.tauri.app/start/migrate/from-tauri-1/)
e [configuração Capacitor](https://capacitorjs.com/docs/config).
57 regressões cobrem preflight dos quatro endpoints, origens nativas,
lookalikes/portas/credenciais indevidas e recusa de checkout sem bearer.

## Distribuição

Os instaladores incluem o frontend compartilhado atual e preservam a identidade
do aplicativo. Android mantém o fingerprint oficial e aumenta versionCode 5→6.
Os builds de PR usam identidade temporária e pacote de diagnóstico; não são
apresentados como a atualização oficial.

A publicação permanente é limitada a main ou à branch exata
`release/native-20261017`, em push/workflow_dispatch. A branch de publicação
será criada somente no commit integrado após CI e builds de revisão. Secrets
permanecem no runner e nunca são retornados. Windows continua com assinatura
Authenticode opcional, conforme configuração existente; Android exige o
certificado permanente para produzir o pacote canônico.

O publicador confere SHA-256, cria a release em rascunho, envia os instaladores
e só então a torna pública. Não substitui assets publicados. Retomada de
rascunho exige o mesmo commit de origem e digest correspondente em todo asset
já enviado. As publicações são serializadas por plataforma.

## Limites e recibos

Validação local: 480 testes em 22 arquivos, quatro regressões de entitlement
Desktop, TypeScript sem emissão e checks 05/06/09, Hub/IPO, offline/realtime,
central nativa, metadados Android e integridade do restore de 175 migrations
passaram. Os frontends Desktop e mobile compilaram. O publicador passou nos ensaios de origem
confiável, checksum, proteção de releases públicas e retomada do mesmo rascunho.

CI, builds, execução publicada das origens e URLs dos instaladores estão
registrados abaixo e no recibo JSON. Nenhuma nova cobrança, abertura de fatura,
notificação Asaas ou mudança de Produção é necessária para conferir CORS.
Dados clínicos, preços, migrations, cotas, IPO e os gates de Auth/segurança e
pagamento real permanecem preservados. O teste no aparelho físico e os aceites
do ciclo financeiro completo continuam próprios, mesmo após build aprovado.

## Revisão integrada e início da distribuição oficial

PR [#164](https://github.com/GustavoFboz/dtfipo/pull/164) integrada em
`97835172aebd052f631a0caa29f455c9f90a755a`, com árvore de produto
`dd6a23ebc3310be1f0d168beee625964e696d031` idêntica à revisão aprovada.

- [CI de build/contratos](https://github.com/GustavoFboz/dtfipo/actions/runs/39063595163): aprovado.
- [Restore isolado](https://github.com/GustavoFboz/dtfipo/actions/runs/39063595174): aprovado.
- [Windows EXE/instalador](https://github.com/GustavoFboz/dtfipo/actions/runs/39063595169): aprovado; assinatura Authenticode ausente no build de revisão.
- [Android](https://github.com/GustavoFboz/dtfipo/actions/runs/39063595191): API 35 obrigatório aprovado, incluindo abertura, WebView, expiração offline, recuperação e pacote de release.

O diagnóstico Android API 37 não passou: o aplicativo abriu (`Status: ok`),
depois o `system_server` abortou em `TaskSnapshotPer` com a asserção gráfica
`hasReadColorBufferDma`, encerrando o sistema do emulador. É uma limitação
experimental registrada; não há aceite Android 17 nem em aparelho físico.

A branch oficial foi criada a partir do merge revisado. Estas notas registram
o resultado dos builds antes da geração definitiva, sem mudar código do produto,
dependências ou regras financeiras. O commit dessas notas também dispara os
workflows nativos, que não iniciaram no evento inicial de criação da branch.
Os recibos públicos e a confirmação servida constam a seguir.

## Web publicada: barreira de origem conferida

Publicação Web solicitada em `69ba8796-901c-4dbf-88c2-a321d452c0e4` para o
commit integrado. A resposta servida em `https://dtfipo.lovable.app` foi
conferida com 24 POSTs técnicos, corpo vazio e sem credencial: cinco origens
nativas nos quatro endpoints e uma origem semelhante indevida nos mesmos
quatro endpoints. As 24 respostas corresponderam ao contrato: origem exata
no CORS das chamadas nativas, recusa da origem indevida e ausência de
`Access-Control-Allow-Credentials`. Checkout/documentos recusaram com 403;
renovação/cancelamento recusaram a entrada vazia com 400. A origem indevida
recebeu 403 nos quatro endpoints.

Os pedidos pararam nas validações iniciais e não consultaram nem alteraram
recursos Asaas. Não houve abertura de fatura, mensagem ao cliente ou operação
financeira nesta conferência. O recibo JSON registra somente status e headers
de CORS, sem credenciais, pacientes ou detalhes financeiros. A conferência de
POSTs negados não substitui preflight publicado ou fluxo financeiro autenticado.

## Instaladores oficiais publicados

Origem dos dois pacotes: `e0c32c604016267f0aa7b3b28659a358e2176a0b`.
Esse commit acrescenta somente notas à árvore de produto integrada na PR #164.
A main permaneceu em `4d07498581263b3e60ef5cf689d211ae5741fb1c`.

| Plataforma | Publicação em Manaus | Verificação |
| --- | --- | --- |
| [Windows 0.6.8](https://github.com/GustavoFboz/dtfipo/releases/tag/windows-v0.6.8) | 17/10/2026 17:45:52 | [Build e publicação aprovados](https://github.com/GustavoFboz/dtfipo/actions/runs/39071585192); instalador e frontend conferidos; sem Authenticode configurado. |
| [Android 0.3.1](https://github.com/GustavoFboz/dtfipo/releases/tag/android-v0.3.1) | 17/10/2026 17:43:12 | [API 35 e publicação aprovados](https://github.com/GustavoFboz/dtfipo/actions/runs/39071585172); certificado permanente confirmado; API 37 experimental caiu no system_server do emulador. |

- [Instalador Windows EXE](https://github.com/GustavoFboz/dtfipo/releases/download/windows-v0.6.8/DentalFlow_Windows_0.6.8_x64-setup.exe), SHA-256 `c64a7dc5485a7c00bfcd20c56a767ce758d4c8afe991e9771446559ad6a9e8ab`.
- [Aplicativo Android APK](https://github.com/GustavoFboz/dtfipo/releases/download/android-v0.3.1/DentalFlow_Android_0.3.1.apk), SHA-256 `d107240302dabe8d6db4abd70f21f95deb95cd65ceb8458a46f3570b889b4a77`.

As duas releases estão públicas, fora de rascunho, com instalador e checksum.
Os digests do GitHub correspondem aos recibos dos workflows. O certificado
Android confirmado tem SHA-256
`8e0c25bfe43f32fd6bdda49c49e6e19624957c2c968af00c867a13936d5330e3`.
O catálogo real foi lido pela função de normalização da Central de Atualizações:
Windows 0.6.8 e Android 0.3.1 aparecem como os mais recentes, com instalador,
checksum e atualização opcional sobre 0.6.7/0.3.0.

O teste no aparelho físico permanece pendente. Autenticação/ciclo financeiro
completo nas três plataformas e os demais aceites SaaS continuam próprios:
**5/23 aceites, 21,74%, 0/7 etapas inteiras concluídas, Sandbox preservado**.
