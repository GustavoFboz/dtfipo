<!-- dentalflow-update {"platform":"android","version":"0.3.0","mandatory":false,"minimumVersion":"0.2.2"} -->

## Identidade permanente do aplicativo

- Primeiro canal Android assinado com a identidade permanente do DentalFlow.
- O pacote oficial volta a usar `br.com.dentalflow.mobile`.
- As próximas versões poderão substituir esta instalação sem trocar de certificado.
- O build de produção agora falha se a chave permanente não estiver disponível ou não corresponder ao certificado oficial.

## Migração única

As versões 0.2.1 e 0.2.2 foram canais de diagnóstico assinados com certificados temporários. O Android pode instalar a 0.3.0 como um aplicativo separado ou solicitar a remoção de uma instalação antiga incompatível. Depois desta adoção única, não será necessário repetir essa migração.

## Mantido nesta versão

- Centro de atualizações nativo com histórico e download de APKs.
- Recuperação de inicialização e proteção contra falhas da WebView.
- Operação local-first, impressão nativa e notificações Android.
