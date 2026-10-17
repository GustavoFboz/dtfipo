<!-- dentalflow-update {"platform":"windows","version":"0.6.8","mandatory":false,"minimumVersion":"0.6.7"} -->

# DentalFlow Windows 0.6.8

- Correção da comunicação dos aplicativos com a cobrança, renovação e documentos do Asaas.
- Inclui as melhorias compartilhadas de arquivos privados, reservas de armazenamento, confirmação de senha e gestão da assinatura acumuladas desde a 0.6.7.
- Mantém a operação local e a sincronização, com autorização offline de até 72 horas e respeito ao período de assinatura confirmado.
- Instalação sobre a versão anterior, preservando a identidade do aplicativo.

O SaaS continua em preparação: esta atualização não libera vendas nem substitui
o teste de pagamento real. O plano Inicial de R$1 permanece reservado ao teste
controlado. A disponibilidade de assinatura Authenticode é informada pelo
workflow; não confundir o checksum do arquivo com assinatura de editor Windows.

### Verificações desta publicação

O instalador e o executável Windows passaram nas verificações do GitHub, junto
com o frontend embarcado e os testes de expiração atômica do cache e da fila
offline. A assinatura Authenticode permanece dependente do certificado de
distribuição configurado; o build de revisão desta versão não está assinado.
