# Próxima publicação Web / Windows 0.6.8 / Android 0.3.1

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

CI, builds, execução publicada das origens e URLs dos instaladores serão
registrados após as verificações. Nenhuma nova cobrança, abertura de fatura,
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
Os recibos públicos e a confirmação servida serão anexados após a conclusão.
