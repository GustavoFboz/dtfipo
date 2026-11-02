# Recuperação do emulador Android API37

O job 120969752916, workflow 40126762200 da PR192, abortou no smoke com
`Assertion failed: !rcEnc->featureInfo()->hasReadColorBufferDma`.
O log registra erros de color buffer antes do encerramento. Não é evidência
de falha financeira; também não comprova homologação do aplicativo nessa API.

A imagem experimental API37 passa a usar `-gpu software`, mantendo a API35
com seu backend já validado. O manual oficial Android recomenda esse modo
para selecionar o backend de software adequado à imagem e marca
`swiftshader_indirect` como obsoleto desde o Emulator 36.4.9.
[Referência oficial consultada em 24/10](https://developer.android.com/studio/run/emulator-acceleration).

Os testes de inicialização, recuperação do renderer, acesso offline e publicação
segura continuam ativos. O diagnóstico experimental permanece separado do
APK oficial da API35. Esta alteração não publica um instalador permanente nem
altera a janela offline de 72 horas. O resultado real exige o recibo do novo CI;
nenhum aceite de aparelho ou do item 2.3 é fechado somente por essa configuração.
