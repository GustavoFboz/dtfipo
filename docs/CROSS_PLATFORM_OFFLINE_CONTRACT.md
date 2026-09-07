# DentalFlow — contrato cross-platform e local-first

A partir desta versão, toda funcionalidade nova do DentalFlow deve ser desenhada para a mesma interface funcionar em Web, Windows/Tauri e futuros shells Android/iOS.

## Regra de ouro

A camada de UI não decide onde os dados vivem. Telas importam os contratos públicos de `@/lib/api`, `@/lib/clinic`, `@/lib/workflow`, `@/lib/stock` etc. O build de cada plataforma resolve o adapter apropriado.

- Web: Cloud Login + Lovable Cloud como fonte online.
- App instalado: adapter local-first, SQLite/armazenamento local como fonte de continuidade e Cloud como sincronização quando disponível.
- Nenhuma tela nova deve depender diretamente de uma consulta Cloud para renderizar informação que precisa continuar acessível offline.

## Identidade

- Uma sessão persistida no WebView não é prova suficiente de identidade Cloud.
- O Desktop valida a sessão no Cloud Login antes de permitir consultas Cloud.
- O cache local é sempre isolado por `owner_id`.
- Troca/mismatch de conta nunca pode reaproveitar silenciosamente o cache clínico de outro usuário.
- Offline, somente uma identidade de dispositivo previamente validada e ainda dentro do prazo pode abrir dados locais.

## Dados

Para cada domínio que precisa operar offline:

1. leitura por adapter local-first;
2. snapshot SQLite de último estado válido;
3. espelho por entidade quando necessário para recuperação;
4. escrita offline na outbox;
5. sincronização idempotente quando a conexão retorna;
6. conflitos explícitos para operações concorrentes críticas;
7. uma resposta Cloud vazia/ambígua nunca apaga automaticamente um snapshot local íntegro.

## Realtime

Quando online, realtime é um sinal de invalidação/sincronização. A UI continua lendo pelo adapter local-first. Quando offline, assinaturas de rede são suspensas e o aplicativo continua pelo armazenamento local.

## Portais, dialogs e shell nativo

O shell Tauri não pode ficar acima dos portals de UI. Dialogs, popovers, menus, tooltips e a Central de Notificações devem se comportar da mesma forma na Web e nos aplicativos instalados.

## Notificações

- Central e histórico usam o mesmo contrato de dados em todas as plataformas.
- No app instalado, notificações são cacheadas localmente e ações offline entram na outbox.
- Popups dentro do DentalFlow continuam disponíveis em qualquer shell.
- Notificação nativa do sistema operacional deve ser implementada por um adapter de plataforma, sem substituir a Central interna.

## Arquivos locais

A futura camada de arquivos locais deve expor um contrato comum para a UI. Cada shell aplica as permissões da plataforma (Windows, macOS, Android/iOS). A UI DentalFlow pode ser totalmente personalizada depois que o usuário concede acesso a um arquivo/pasta pelo mecanismo seguro da plataforma.

## Critério de revisão

Uma feature nova não está pronta para merge se introduzir uma dependência exclusivamente Web em um fluxo que deva operar no aplicativo instalado, sem adapter/fallback equivalente documentado.
