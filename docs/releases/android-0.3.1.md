<!-- dentalflow-update {"platform":"android","version":"0.3.1","mandatory":false,"minimumVersion":"0.3.0"} -->

# DentalFlow Android 0.3.1

- Correção da comunicação do aplicativo com a cobrança, renovação e documentos do Asaas.
- Inclui as melhorias compartilhadas de arquivos privados, reservas de armazenamento, confirmação de senha e gestão da assinatura acumuladas desde a 0.3.0.
- Mantém inicialização protegida, operação local, sincronização e autorização offline de até 72 horas.
- Atualização assinada com a mesma identidade permanente da 0.3.0, pacote `br.com.dentalflow.mobile`, versionCode 6.

O SaaS continua em preparação; esta atualização não libera vendas nem substitui
o teste de pagamento real. O plano Inicial de R$1 permanece reservado ao teste
controlado. A validação em emuladores e o teste no Moto G56 são registrados
separadamente; gerar o APK não comprova todos os fluxos em aparelho físico.

### Verificações desta publicação

O build e os testes obrigatórios no emulador Android API 35 passaram, incluindo
abertura, WebView, expiração offline, recuperação e pacote de release. O ensaio
experimental API 37 abriu o aplicativo, mas o `system_server` do emulador caiu
durante a retomada, com falha gráfica `hasReadColorBufferDma`. Esse ensaio não
comprova compatibilidade com Android 17 nem substitui o teste em aparelho físico.
