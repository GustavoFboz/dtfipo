# Preparo restrito da troca de plano Sandbox

O job privado `plan_change` consulta somente a fixture B já autorizada, em
Sandbox, de Growth para Inicial. A capacidade continua expirada em até quinze
minutos, de uso único e com seleção do tipo no backend. HTTP recebe somente
o ID do job; não aceita identidade, empresa, plano, preço, ambiente ou datas.
As duas sessões USER são verificadas pelo Auth, sem promoção ou MFA artificial.

O fluxo lê contrato/ledger/preços privados, cliente com entrega desativada,
assinatura e lista completa limitada de cobranças. Consulta a cotação pela
RPC normal do gestor e confere a recusa entre empresas. Nenhum método de
escrita do Asaas é disponibilizado a esse job.

Se uma instrução já existe no histórico, ela é apresentada para revisão, sem
nova submissão. Excesso de uso, calendário divergente ou fatura futura emitida
produzem uma fase de bloqueio explícita, sem criar pedido. Não há exclusão de
fatura, geração de boleto, alteração de data, pagamento ou ajuste do relógio.

Somente quando todas as condições passam, uma chamada autenticada normal
registra a solicitação cotada. Resposta ambígua encerra a tentativa; uma nova
conferência lê primeiro o histórico. O job não executa a solicitação financeira.
Master/autenticador, conferência do provedor, pagamento e aplicação na vigência
continuam separados. O rollout da ação em Produção permanece fechado.

| Fase do recibo | Significado |
| --- | --- |
| `BLOCKED_CUSTOMER_LIMITS` | A cotação exige revisão de uso/capacidades. |
| `BLOCKED_PROVIDER_CALENDAR` | O próximo vencimento difere do fim do período pago. |
| `BLOCKED_FUTURE_INVOICE` | Já existe uma fatura a partir da vigência pretendida. |
| `EXISTING_REQUEST_REQUIRES_MASTER_REVIEW` | Há pedido anterior; não foi repetido. |
| `AWAITING_MASTER` | Um pedido normal foi confirmado; falta a ação Master. |
| `COMPLETED_SCHEDULED` | Preço futuro confirmado por GET, uma escrita Master auditada, faturas antigas e plano pago atual preservados; não cria pedido nem aplica o plano antecipadamente. |

Um job verde em uma fase de bloqueio comprova a conferência e o respeito ao
limite, não uma troca executada ou um novo aceite. O recibo contém hashes,
contagens, valores e datas de teste; omite credenciais, URLs, dados fiscais e
payloads do provedor. A assertiva `sql/plan-fixture-assertions.sql` confere os
oito tipos e os grants privados somente por leitura; a restauração completa
contém 186 migrações. A migração amplia somente o enum do job privado, sem
adicionar autoridade financeira ao worker.

Depois da ação Master, outro job de uso único pode observar o termo programado.
Confere o preço e calendário atuais por GET, todas as faturas antigas, histórico
e plano atual na sessão normal do gestor e auditoria com uma única escrita.
`COMPLETED_SCHEDULED` não equivale a pagamento do novo período nem à aplicação
do plano na data futura; esses resultados conservam suas provas próprias.
