# Progresso dos aceites finais para vendas

Baseline de 04/10/2026, 23h06 de Manaus. A porcentagem mede itens com aceite
integral registrado, não linhas de código nem estimativa de esforço. O plano
tem 23 itens, derivados das sete etapas apresentadas ao responsável.

Atualização de 08/10/2026: testes restritos integrados; execução real bloqueada
pela indisponibilidade do Lovable Cloud. A cadência Sandbox aceita em 05/10 é
histórica e não comprova a disponibilidade atual.

Retomada de 17/10/2026: consultas ao banco e jobs privados voltaram a funcionar;
288 disparos Sandbox em 24h reconferidos. Identidade: 15/16 verificações reais
aprovadas; mínimo global de oito caracteres ainda falha. Checkout Sandbox
criou recursos corretamente, mas o job tratava o retorno HTTPS como envelope
de server function. A correção foi integrada no PR160 e o job publicado passou
25/25 verificações reais. Duplicatas/ordem e histórico/documentos têm agora
prova completa. Armazenamento passou 50/50 checks reais após corrigir preparo
e leitura de cache. [Provas da rodada de 20%](evidence/acceptance-20-20261017.md).
**Aceites integrais: 6/23 — 26,09%. Restam 17 itens parciais/em aberto.
Etapas inteiramente encerradas: 0/7.**
Existe implementação e evidência parcial, descrita no RELEASE-PLAN.md; não
reiniciamos o trabalho. Cada aceite novo deve referenciar prova, revisão e data.

Em 19/10, 01h33 Manaus, o primeiro pagamento real foi confirmado no backend:
R$5 em Produção, checkout pago, `PAYMENT_RECEIVED` processado uma vez sem erro,
assinatura Inicial ativa e Laboratório selecionado. O titular confirmou acesso
e plano corretos. **Item 7.3 concluído; 6/23.** O item 7.2 permanece parcial
somente pelo alerta operacional real de Produção, ainda sem aceite.
[Prova, revisão e limites](evidence/first-production-payment-20261019.md).

Os checkpoints de 18/10 abaixo são históricos.

Em 18/10, 16h47 Manaus, a API confirmou o webhook de Produção ativo após
ativação pelo titular no próprio navegador: fila não interrompida e 13 eventos
corretos. Backend, GitHub e cron continuam em Produção, com HTTP 200 e
telemetria saudável; cron Sandbox desativado. Entrega autenticada e compra
real continuam pendentes; 5/23 preservados.
[Conferência e próximos passos](evidence/production-webhook-activation-20261018.md).

Tentativa do titular em 18/10, 17h50–17h53: cliente de Produção criado,
assinatura recusada com `invalid_value`, sem pagamento. O mínimo oficial de
R$5 impede o teste solicitado de R$1. O titular autorizou R$5/mês às 18h00;
o catálogo foi ajustado e reconferido às 18h01m52s. A correção explica e bloqueia
o valor insuficiente antes de criar recursos externos.
[Diagnóstico e proposta](evidence/production-checkout-minimum-20261018.md).

| Item | Resultado exigido | Status atual |
| --- | --- | --- |
| 1.1 | Dois dead letters reconciliados individualmente com o Asaas | Parcial: Asaas confirmou a mesma cobrança Sandbox RECEIVED de R$5, vencimento 29/09; responsável confirmou criação manual externa. Sem ledger/checkout local. Revisão auditada Master/AAL2 preparada; decisão real dos dois eventos ainda pendente. [Prova](evidence/inbox-review-20261005.md) e [fluxo](STAGE-07-EXTERNAL-TEST-REVIEW.md) |
| 1.2 | Duplicatas e eventos fora de ordem | Concluído em Sandbox, 17/10, 14h45 Manaus: duas entregas idênticas adicionais por fixture conservaram uma linha e exatamente a vigência paga. Aviso OVERDUE antigo foi ignorado por SUPERSEDED_PROVIDER_STATUS após GET atual; recuperação e confirmação convergiram para uma linha. [Recibo e revisão](evidence/acceptance-20-20261017.md) |
| 1.3 | Webhook perdido recuperado | Parcial: reconciliação implementada |
| 2.1 | Estados do ciclo financeiro | Parcial: ensaios; provedor pendente |
| 2.2 | Dados e período pago preservados | Parcial: regras/testes; aceite do fluxo pendente |
| 2.3 | Acesso nas plataformas e janela offline de 72 horas | Parcial: código, CI/restore, instalador Windows e limpeza offline nos emuladores Android; recuperação API 37/distribuição/aparelhos/iOS pendentes |
| 3.1 | Upload/exclusão de casos, pacientes, fotos e avatar | Concluído pelas APIs autenticadas em 17/10, 15h06 Manaus: 50/50 checks reais nas duas fixtures USER, quatro buckets, tamanho/hash/cota consistentes, excesso e acesso estrangeiro recusados, oito exclusões e cota zero. Preparo clínico descartável administrativo; sem promoção de papéis. Aparelhos, concorrência/resíduos e links históricos mantêm aceites próprios. [Recibo e revisão](evidence/acceptance-20-20261017.md) |
| 3.2 | Concorrência, falhas e reservas históricas | Parcial: ensaios; revisão histórica pendente |
| 3.3 | Armazenamento nas plataformas disponíveis | Pendente de aparelhos |
| 4.1 | Cadastro, confirmação e recuperação de senha | Parcial: em 17/10, 15/16 checks reais passaram, incluindo cadastro, confirmação, recuperação e login. Auth ainda aceitou senha de sete caracteres; ajuste global e nova prova negativa pendentes. [Recibo](evidence/continuity-20261017.md) |
| 4.2 | Sessões, MFA, isolamento e replay financeiro | Parcial: fixtures/testes; replay real pendente |
| 4.3 | Arquivos privados e validade dos links | Parcial: referências sem bearer persistente, assinatura de cinco minutos, renovação, isolamento de sessão e espelho instalado limitado a 72h implementados; 38 referências históricas ainda requerem tratamento/revogação e prova autenticada publicada. [Implementação e limites](PRIVATE-FILE-ACCESS.md) |
| 5.1 | Histórico e documentos de cobrança | Concluído em Sandbox, 17/10, 14h45 Manaus: sessões gestoras das duas fixtures consultaram histórico e abriram documento do pagamento validado no provedor (HTTP200); outra clínica foi recusada no histórico e documento (HTTP403). [Recibo e revisão](evidence/acceptance-20-20261017.md) |
| 5.2 | Solicitações executadas no Asaas | Parcial: executor de cancelamento com revisão Master/AAL2, lease, auditoria e readback implementado; execução autenticada real e troca de plano por vigência ainda pendentes. [Contrato e limites](STAGE-08-BILLING-CENTER.md) |
| 5.3 | Downgrade, falhas e execução única | Parcial: inativação única e retomada somente por GET implementadas; ensaios não substituem falhas reais, downgrade e preço por vigência |
| 6.1 | Processador regular e alertas comprovados | Concluído em Sandbox, 05/10, 18h17 de Manaus: 24 disparos a cada 5 minutos, 24 respostas HTTP 200 com telemetria saudável, alerta real de heartbeat antigo entregue à caixa do operador e recuperação observada. Produção permanece no gate 7.2. [Prova e limites](evidence/database-scheduler-20261005.md) |
| 6.2 | Backup, restauração e incidente | Parcial: restore limpo e recuperação de heartbeat real comprovados; backup/restauração operacional de dados e rollback ainda pendentes |
| 6.3 | Onboarding, plataformas e capacidade piloto | Em aberto |
| 6.4 | Documentos comerciais e privacidade revisados | Protocolo preparado; minutas/revisão pendentes |
| 7.1 | Conta recebedora aprovada | Concluído em 05/10, 13h49 de Manaus: chave real autenticada e general=APPROVED; [prova e revisão](evidence/production-preflight-20261005.md). Pendência bancária registrada separadamente |
| 7.2 | Secrets, webhook e agendamento de Produção | Parcial, 19/10, 01h33 Manaus: Produção configurada; cron ativo, HTTP 200 e processador saudável. Entrega autenticada comprovada pelo evento normal PAYMENT_RECEIVED recebido e processado sem erro. Falta o alerta operacional real de Produção para o aceite integral. [Prova e limites](evidence/first-production-payment-20261019.md) |
| 7.3 | Recebimento, ledger e acesso reais comprovados | Concluído em 19/10, 01h33 Manaus: pagamento real de R$5 em Produção, checkout pago, evento PAYMENT_RECEIVED processado uma vez sem erro e assinatura Inicial ativa. Valor, pagamento e assinatura conferem; Laboratório ativo, cota do plano correta e acesso/plano confirmados pelo titular. [Recibo e revisão](evidence/first-production-payment-20261019.md) |
| 7.4 | Decisão de liberação para vendas | Pendente dos demais aceites |

Um item aprovado vale 100/23 pontos percentuais. Etapas são encerradas somente
quando todos os seus itens e riscos aplicáveis têm decisão registrada. Mudanças
de escopo exigem atualizar denominador e explicar a mudança; não arredondar
uma prova parcial para concluída nem incluir teste fictício como pagamento real.

Meta solicitada em 05/10, 20h35 de Manaus: chegar a 10/23, sem alterar o
denominador. O [plano de oito aceites adicionais](TARGET-10-OF-23.md) registra
as provas e dependências. Consulta de 06/10, 00h35 UTC: os dois eventos externos
seguem dead_letter, sem auditoria de conclusão. Contador permanece **2/23**.

## Continuidade de 08/10/2026

O [PR154](https://github.com/GustavoFboz/dtfipo/pull/154) integrou validações
restritas de Auth, checkout/pagamento Sandbox e armazenamento, sem atribuir
novos aceites. Passaram 414 testes em 22 arquivos, build e CI; a restauração
reproduz 175 migrações. A política restritiva de leitura de avatares foi aplicada
ao banco às 19h59min47s UTC. As 38 referências assinadas históricas mantêm o
tratamento pendente do item 4.3.

A última leitura financeira bem-sucedida (19h55min24s UTC) ainda registrou os
dois eventos manuais em dead_letter, zero revisões Master e zero pagamentos de
Produção. O job de identidade preparado às 20h02min36s retornou HTTP403; na
leitura às 20h03min34s não havia claim, recibo ou usuário descartável. Não
confundir esse resultado com falha de senha, MFA ou aceite de recuperação.

O diagnóstico das 20h12 UTC comprovou HEALTH_READ_TIMEOUT nos logs publicados
e backend_unreachable_db na conexão Auth→banco. A causa específica do HTTP403
continua indeterminada. A recuperação do Cloud é necessária para verificar a
publicação e retomar esses testes. [Evidências, limites e sequência de retomada](evidence/fixture-cloud-checkpoint-20261008.md).

**Checkpoint histórico de 08/10: 2/23 (8,70%); 21 itens abertos/parciais; 0/7 etapas
inteiramente encerradas. Os oito aceites adicionais da meta continuam pendentes
de prova. Produção e a compra real de R$1 não estão liberadas por esta rodada.**
