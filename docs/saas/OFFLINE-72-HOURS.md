# Acesso offline dos aplicativos — até três dias

Decisão do responsável em 04/10/2026, 23h06 de Manaus. Item 2.3 do protocolo
SaaS; contribui também para os aceites de segurança e operação. Status:
implementação validada parcialmente em CI, ainda sem aceite em aparelhos ou release distribuída.

## Regra

Após autenticação online e confirmação de acesso integral pelo servidor, o
dispositivo recebe autorização por no máximo 72 horas. Uma revalidação online
com acesso integral pode renovar esse prazo. Leitura de cache, abertura do app,
refresh de JWT, conexão indicada pelo sistema ou RPC que falhou não renovam.
O período financeiro já confirmado também limita o acesso clínico; três dias
offline não constituem carência de pagamento adicional.

Sem internet não é possível conhecer uma inadimplência nova no Asaas. A janela
limita o tempo que o app confia na última confirmação. O bloqueio online usa
o estado do servidor. Contas com acesso isento mantêm seu privilégio online,
mas também precisam renovar a autorização do dispositivo a cada três dias.

## Expiração e limpeza

- O limite vale inclusive para autorizações antigas: Desktop tinha 14 dias e
  Android 30 dias; o código novo limita ambas a 72 horas da validação original.
- A leitura da identidade vencida apaga cache e outbox daquela conta em
  transação, inclusive alterações pendentes. Outras contas no banco local
  conservam seus registros. Não há exclusão de prontuários do backend.
- A limpeza também revoga gravações locais daquela conta: uma operação que
  terminou atrasada não pode recriar cache/outbox após a exclusão. Somente uma
  nova validação online permite novas gravações.
- A autorização local só é removida após sucesso da limpeza do banco. Falhas
  bloqueiam o uso e preservam a informação necessária para uma nova tentativa.
- Snapshots de sessão e rascunhos clínicos/comerciais do WebView são limpos;
  o logout remove a sessão local e o bloqueio desmonta a interface clínica.
- Android tem bridge nativo para limpar cache de recursos, histórico, formulários
  e cookies do WebView. Windows usa o comando assíncrono de limpeza de browsing
  data do Tauri/WebView2. Uma pendência persistida exige repetir a limpeza antes
  de permitir novas leituras locais. A limpeza do WebView afeta seu perfil
  inteiro, incluindo preferências e outros caches do WebView, mas não apaga
  SQLite de outras contas. A preservação por conta no cache adicional de anexos
  não constitui promessa de preservar esse cache após a limpeza integral do
  perfil WebView2 do Windows.
- O cache adicional de anexos em IndexedDB é apagado por conta; cópias em
  memória são descartadas e downloads iniciados antes da expiração não podem
  persistir novos arquivos após a limpeza.
- CacheStorage da origem é limpo; arquivos que o usuário exportou para Downloads
  ou outras pastas pessoais não são controlados nem apagados pelo aplicativo.
- O app avisa, ao operar offline, que alterações não sincronizadas serão apagadas
  no vencimento e orienta conexão para sincronizar antes do prazo.

O temporizador verifica o vencimento enquanto o processo está ativo; abertura
e retomada também verificam. Não há promessa de apagar dados exatamente no
instante do vencimento enquanto o celular estiver desligado ou o sistema tiver
suspenso o processo. A próxima execução bloqueia antes de entregar identidade.
As APIs de exclusão não são certificação de apagamento físico irrecuperável do
dispositivo. Relógio, arquivos e JavaScript locais não constituem DRM inviolável.

## Plataformas e implantação

A política é compartilhada pelas fachadas instaladas. Android e Windows têm
implementações nativas compiladas; a homologação em aparelhos permanece pendente. A detecção compartilhada
inclui iOS, mas o repositório ainda não tem release iPhone nem adapter validado
de limpeza WKWebView; nesse shell, limpeza nativa ausente falha bloqueando acesso.
Não declarar o requisito iPhone concluído sem esse adapter e teste próprio.

Web usa a autorização online existente; a regra não transforma a versão Web
em aplicativo offline. Instalações atuais só recebem esta mudança depois de
instalar a nova versão. Atualizar código no GitHub não atualiza um EXE/APK já instalado.

## Aceites ainda necessários

1. Registrar o resultado completo das matrizes nativas e homologar as bridges
   em aparelhos. Compilação Windows/Rust e APK no emulador estável já passaram.
2. Testar antes, no limite e após 72 horas com relógio de teste controlado;
   iniciar fechado já expirado e retomar depois de suspensão.
3. Verificar cache/outbox removidos, ausência de fallback por JWT antigo,
   falha de limpeza com retentativa, outra conta preservada e dados remotos intactos.
4. Reautenticar online com assinatura válida; repetir com acesso suspenso.
5. Confirmar interface, aviso e objetos armazenados nos aparelhos e distribuir
   versões identificadas. iOS requer implementação e homologação próprias.

Fontes técnicas oficiais:
- https://docs.rs/tauri/latest/tauri/webview/struct.Webview.html
- https://developer.android.com/reference/android/webkit/WebView

## Evidência de implementação em 04–05/10/2026

Revisão de código `cc8b3960b7f2abd5150d59d6e86ae7aa79367dcd`:

- CI geral 37260882490 e restauração 37260884975: sucesso.
- Windows 37260882543: sucesso; testes Rust de exclusão atômica, rollback e
  revogação de gravações, compilação e instalador. Não é teste interativo
  da limpeza WebView2 em um computador de usuário, nem distribuição assinada.
- Android 37260882514, job 111607663196 (API 35): sucesso; fixtures locais
  comprovaram exclusão de cache/outbox/anexos da conta vencida, preservação
  dos registros/anexo da outra conta e remoção de cookies/cache/rascunhos.
  Nenhuma conta Auth, pagamento ou dado clínico remoto foi alterado.
- API 37, repetição isolada (job 111609212114): o teste de expiração e limpeza
  offline passou, conforme log de 05/10 às 04h02 UTC. O job falhou depois, no
  teste de recuperação do renderer, com
  `!rcEnc->featureInfo()->hasReadColorBufferDma`. A matriz é experimental e usa
  `continue-on-error`; o status global success não aprova esse job nem encerra
  a compatibilidade Android de prévia. Não houve alteração para ocultar a falha.
- 17 testes TypeScript específicos e verificações estáticas de SaaS, Desktop
  e Android passaram. Isso não fecha o item 2.3 do protocolo sozinho.

Links de execução:
- https://github.com/GustavoFboz/dtfipo/actions/runs/37260882490
- https://github.com/GustavoFboz/dtfipo/actions/runs/37260884975
- https://github.com/GustavoFboz/dtfipo/actions/runs/37260882543
- https://github.com/GustavoFboz/dtfipo/actions/runs/37260882514
