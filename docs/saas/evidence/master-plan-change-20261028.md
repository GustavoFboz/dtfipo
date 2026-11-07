# Cancelamento e troca executados no Asaas — 28/10/2026

Checkpoint de **28/10/2026, 20h48 Manaus** (2026-10-29T00:48:18.184179+00:00 UTC).
**Item 5.2 concluído: 13/23 (56,52%), 10 restantes, 1/7 etapas encerradas.**
Cancelamento A e troca de plano/preço B foram executados no Sandbox com
Master e desafios MFA reais, uma escrita por pedido e confirmação no provedor.
Três jobs passaram **54/54 verificações reais**: 18 de cancelamento, 16 de
preparo e 20 de observação da troca. Nenhum resultado sintético foi contado.

O critério 5.2 corresponde a **solicitações executadas no Asaas**, conforme
o registro original. Pagamento/aplicação do novo período e recuperação após
falha real conservam seus aceites em 5.3 e no ciclo financeiro. O estado
`scheduled` não foi convertido em `active` para concluir o contador.
Para ultrapassar 60%, falta **um** aceite integral: 14/23 = 60,87%.

## Operações, revisões e publicação

O [cancelamento A](master-cancellation-20261028.md) foi confirmado em
00h06m20 UTC, com Asaas INACTIVE e três cobranças preservadas.
O novo pedido B `8a301cfc-d559-4b01-bf8b-19a38d5aa3e8` foi criado pela sessão
USER normal após cotação, limites, calendário e faturas válidos. Nenhuma fatura
futura impedia a operação. O Master confirmou um desafio MFA próprio para a
troca, revisou preço/data/preservação e enviou uma vez.

Escrita B iniciada em **00h35m13.425873 UTC**, concluída às
**00h35m16.525583 UTC**. Auditoria com sessão real, justificativa, erro nulo,
resultado `completed` e hash de prova `24449d5ecf46545fd1e90652977c69c2`.
O servidor fez readback e preservou a fatura da janela atual. O job posterior
conferiu independentemente o histórico completo de duas faturas, sem outro PUT.

| Contrato B | Resultado |
| --- | --- |
| Plano/preço pago atual | Growth / R$449, preservado |
| Recorrência futura no Asaas | Inicial / R$5 de teste, confirmada por GET |
| Vigência | 18/12/2026, 00h00 UTC = 17/12/2026, 20h Manaus |
| Termo local | Um, `scheduled`; `activated_at` nulo |
| Pagamento do novo período | Não realizado nesta rodada |
| Execuções financeiras B | Uma, auditada |
| Novos pedidos/repetições após a execução | Zero |

![Troca programada no Master](screenshots/sandbox-plan-change-master-20261028.jpg)

- [PR208](https://github.com/GustavoFboz/dtfipo/pull/208), merge
  `c970a53455cfde4b3786881a6db560a456ad57ed`: prepara somente B elegível e
  atualiza uma vez o snapshot Master após a ação, sem polling.
- [PR209](https://github.com/GustavoFboz/dtfipo/pull/209), merge
  `a6cc79cd6ad727b5d5e22e7bccf658d8a483dca0`: observação independente de
  preço futuro, faturas, auditoria e plano atual; nenhum executor foi alterado.
- Publicações inicialmente `pending`, confirmadas pelos recibos reais do
  código novo. IDs e manifesto de 186 migrações estão no JSON.
- **495 testes locais em 25 arquivos**, tipos, build, etapas 06/08/09,
  contratos estáticos e restauração limpa de 186 migrações aprovados.
  CI Web/restore passou nas duas revisões. Windows e API35 da PR208 passaram;
  API37 falhou no smoke apesar do workflow geral verde. CI nativa da revisão
  somente de QA é registrada conforme o estado observado, sem aceite de aparelhos.

## Observação independente e integridade

Job posterior `ce553197-17a4-469e-9055-bd552e3a207c`: HTTP200, 20/20,
`COMPLETED_SCHEDULED`, capacidade consumida e removida localmente. O Asaas foi
consultado sequencialmente com credenciais Sandbox, sem retry financeiro.
A sessão gestora normal confirmou acesso integral, Growth/R$449 e o pedido
concluído; outra empresa não pôde consultar a cotação.

Os hashes das duas faturas e do ledger coincidem com os do preparo. Onze
campos de preservação coincidem entre 00h34m57 e 00h48m18 UTC:

| Dado | Antes e depois |
| --- | --- |
| Arquivos prontos / bytes | 701 / 8374117446 |
| Reservas | 0 |
| Storage | `14ddf47d3f3a030d26a698aafc8643d5` |
| Casos | `419b08f5b8905de5caa4fa9616ed4db6` |
| Pacientes | `d1573a1878b4cc6ab9f2d2b3143b3f2d` |
| Pagamentos | `b2c430d6aaed7c02409aca88b4b649ea` |
| Contratos fora das fixtures | `5f93ae8a05622562813e88f6797b522d` |
| Quatro preços e planos atuais | Idênticos; digest no JSON |
| Contratos A/B e período pago | Preservados; A cancelada, B ativa |
| Cancelamento A | Continua uma execução; não foi repetido |

Mudaram somente o pedido B para concluído, o termo futuro e a auditoria de uma
escrita. Nenhum pagamento, fatura, catálogo, arquivo ou dado clínico foi alterado
por essa instrução. Nenhum job permaneceu em execução. Conexões observadas:
50 antes e 25 no fim, sem espera por locks;
telemetria Produção permanece registrada no snapshot. Não houve mudança de cron
ou liberação financeira nova em Produção.

## Prova que ainda falta

O item 5.3 permanece parcial: comprovar o pagamento e a aplicação do downgrade
na vigência, os limites/cotas durante a aplicação e a retomada após falha real
ambígua sem outra escrita. A data contratada não foi antecipada nem o relógio
alterado. Os ensaios descartáveis de CI não substituem esses eventos reais.
Os critérios de ciclo completo, aparelhos/offline, backup operacional,
capacidade piloto, documentos e liberação comercial continuam próprios.

[Recibos, auditoria, snapshots e limites sanitizados](master-plan-change-20261028.json).
