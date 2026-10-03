# Retomada SaaS/Asaas — etapa 05/09

## Leitura do ambiente ativo

Consulta somente leitura em 03/10/2026, às 10:38 UTC:

| Item | Resultado |
| --- | --- |
| Empresa Inicial, novas contratações | 100 centavos/mês |
| Contrato Sandbox já existente | 24.900 centavos/mês, preservado |
| Assinatura Sandbox | Ativa até 29/11/2026 |
| Ledger pago | Dois pagamentos |
| Fila financeira | Cinco eventos processados e dois dead letters |
| Master | Zero operadores cadastrados |

Uma segunda consulta confirmou que os dois dead letters são da mesma
cobrança, ausente do ledger local. Seus payloads salvos contêm somente o
identificador da cobrança, sem vínculo de assinatura. Esse formato também
aparece em eventos pagos já processados; a ausência do vínculo no payload
salvo **não comprova** que a cobrança seja avulsa. Somente a consulta
autoritativa do recurso no Asaas pode esclarecer isso.

Os eventos são `PAYMENT_OVERDUE` e `PAYMENT_RECEIVED`, com seis tentativas
e `PROVIDER_RECONCILIATION_FAILED`. Esse código foi gravado antes da melhoria
de diagnóstico da PR #107. Nenhum desses eventos foi reprocessado nesta
retomada, e nenhum estado financeiro foi alterado pela consulta.

## Correção implementada

- Um aviso antigo de atraso, quando o Asaas já mostra pagamento, cria ou
  reutiliza o evento de recuperação do pagamento atual antes de encerrar
  o aviso antigo. Uma confirmação antiga, quando o Asaas já mostra estorno
  completo, segue o mesmo fluxo para o estorno.
- O evento recuperado passa novamente pelo GET Asaas e pela RPC existente,
  incluindo empresa, ambiente, valor contratado, período e idempotência.
- Cobrança avulsa, excluída, status de risco ou estorno que inesperadamente
  aparece pago continua em revisão. Não há concessão por aproximação.
- Falha na gravação da recuperação conserva o evento original como falha
  recuperável. Perda de lease em um evento e falha de consulta de carência
  em uma empresa permitem continuar os outros itens do lote.
- Contadores `workerReview` e `graceReview` expõem falhas parciais com HTTP
  503, preservando os contadores das operações concluídas. Os logs usam
  apenas códigos fixos, sem mensagens externas ou dados pessoais.

O modelo de persistir antes de confirmar e deduplicar os IDs segue a
[documentação oficial do Asaas](https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook).
O arquivo de teste cobre entregas fora de ordem, estorno, persistência
indisponível, duplicatas, status de risco e continuidade do lote.

## Verificação local

- 38 testes do worker passaram.
- 78 testes de cobrança, armazenamento e entitlement Desktop passaram.
- Checks 06/09, TypeScript e build Web passaram.
- O pacote de restauração permanece com 164 migrations; esta correção
  não exige alteração de schema ou migração no banco ativo.
- Build Desktop passou com `vite build --configLoader runner --config
  vite.desktop.config.ts`; os checks de entitlement Desktop, IPO e contrato
  Android passaram.
- [Dental Flow CI](https://github.com/GustavoFboz/dtfipo/actions/runs/37117895638)
  e [restauração limpa](https://github.com/GustavoFboz/dtfipo/actions/runs/37117895628)
  passaram no candidato `d4757a6`. O ensaio disparado pela
  [PR](https://github.com/GustavoFboz/dtfipo/actions/runs/37117926695) também passou.
- A [PR #108](https://github.com/GustavoFboz/dtfipo/pull/108) foi integrada na
  branch conectada pelo merge `43c2ff9`. A árvore do merge corresponde à
  árvore validada `81bfd2f99df5c6580911b3cf7352924b14f986a6`, e o conector Lovable
  confirmou sincronização desse merge. A publicação do código foi solicitada;
  a chamada retornou `pending`, ainda sem confirmação final de hospedagem.

## Pendências para fechar o protocolo

| Etapa | Prova/implementação restante |
| --- | --- |
| 04 | Consulta dos dead letters, replay autorizado, perda de webhook e idempotência no Sandbox publicado. |
| 05 — atual | Atraso da assinatura correta, carência, suspensão, estorno, cancelamento e reativação. |
| 06 | Upload comum, fotos e DICOM na conta publicada; limite e liberação de cota verificados. |
| 07 | Identidade do operador Master autorizada e MFA AAL2 comprovada. |
| 08 | Cancelamento e troca de plano iniciados pelo cliente, com vigência e cobranças pendentes tratadas no Asaas. |
| 09 | Homologação final nas plataformas, observabilidade, configuração separada de Produção e teste controlado de R$1 pelo operador. |

O preço de R$1 para novos contratos e a isenção IPO permanecem preservados.
A assinatura Sandbox existente de R$249 não representa o preço de uma
nova contratação, e uma cobrança de R$5 não comprova seu ciclo contratual.

## Próximo passo financeiro e autorização pendente

Consultar somente para leitura a cobrança dos dois dead letters no Asaas
Sandbox por meio do backend, conferir vínculo, preço, referência e status
atual, e registrar apenas o diagnóstico necessário. Na sessão anterior, a
revisão automática bloqueou a transferência dos identificadores ao serviço
Lovable e exigiu autorização explícita. A consulta ao provedor permanece
pendente dessa autorização; esta entrega avança o código e a leitura do
banco sem contornar o bloqueio anterior.

Na retomada, tentou-se uma consulta delegada em modo de planejamento,
solicitando que o agente Lovable resolvesse internamente os identificadores,
sem incluí-los no pedido. A revisão automática também rejeitou essa ação:
ela delega acesso a registros privados e credenciais Asaas do backend a
um agente externo sem autorização explícita, e o modo de planejamento
não garante que o agente permaneça somente em leitura. Nenhum trabalho
do agente foi iniciado. A investigação no provedor segue bloqueada;
essa rejeição não foi contornada por execução indireta.

Depois da consulta: uma cobrança sem vínculo permanece para revisão;
uma cobrança vinculada precisa conferir o contrato original. Autorizar e
auditar o replay separadamente, revalidando o recurso atual no worker.
O caso de atraso deve corresponder ao ciclo devido da assinatura testada.
Antecipar uma cobrança em um período já pago não deve suspender o acesso.

## Reversão

Reverter somente esta correção do worker, mantendo inbox, ledger, dados
clínicos, planos e migrations. Preservar eventos recuperados para auditoria
e investigação, mesmo após eventual reversão do código.
