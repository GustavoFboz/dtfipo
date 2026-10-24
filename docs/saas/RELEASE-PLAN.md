# DentalFlow SaaS — sete etapas restantes até vendas

Atualizado em 22/10/2026; as evidências novas registram horários UTC e Manaus. Este é o contador de conclusão
apresentado ao responsável. Os IDs 00–10 dos documentos técnicos permanecem
para manter o histórico; não são um segundo protocolo.

**Restam 7 de 7 etapas com aceites em aberto.** Há código e provas parciais
em todas elas; um incremento aprovado não encerra automaticamente a etapa.
Frente atual: **4/7 — identidade e política de senhas comprovadas em Produção**.
Em 21/10, 23h49 Manaus, após autorização explícita e publicação de `ef31ce3`,
o Auth com mínimo global de oito caracteres passou 16/16 checks reais. O item
4.1 está concluído. **Aceites atuais: 8/23 (34,78%), 15 em aberto/parciais,
0/7 etapas encerradas.** [Prova e limites](evidence/authorized-publication-20261021.md).

Continuidade de 22/10, 00h05 Manaus: PR181 publicada; Storage passou 84/84
checks reais, com concorrência, falhas, tamanho e cota comprovados. A consulta
privada do Asaas identificou a fila do alerta em outro endpoint, interrompida;
a fila DentalFlow está ativa e não interrompida. Nenhuma fila foi alterada.
As reservas históricas e os demais critérios continuam abertos; total 8/23.
[Recibos e observações de segurança](evidence/authorized-runtime-validation-20261022.md).

Checkpoint financeiro de 19/10:
Em 19/10, às 01h33 Manaus, o backend confirmou o pagamento real de R$5 do
Inicial, checkout pago, evento normal `PAYMENT_RECEIVED` processado sem erro e
assinatura ativa. Laboratório e cota correspondem ao plano; o titular confirmou
acesso e seleção corretos. O item 7.3 está concluído. Às 02h24 Manaus, o ensaio
de alerta autorizado, sua notificação real e a inspeção saudável posterior
concluíram o item 7.2. A decisão de vendas permanece pendente.
**Aceites naquele checkpoint: 7/23 (30,43%).**
Ver [primeiro recebimento real, revisão e limites](evidence/first-production-payment-20261019.md).

Frente operacional concluída para 7.2: diagnóstico corrigido para webhook
ativo; ensaio #96 alterou somente uma cópia do snapshot, gerou a falha esperada
e teve notificação recebida na INBOX. A inspeção normal #97 passou depois.
Cron, ledger e assinatura paga permaneceram intactos. Os demais estados do
ciclo, dados/backup, aparelhos e decisão comercial continuam em aberto.
Ver [prova do alerta e limites](evidence/production-alert-20261019.md) e
[diagnóstico anterior](evidence/production-monitor-preparation-20261019.md).

Histórico da preparação em 18/10:
Em 18/10, às 16h47 Manaus, a API confirmou o webhook de Produção ativo após
ativação pelo titular no próprio navegador: fila não interrompida e 13 eventos
corretos. Backend e GitHub estão alinhados em Produção, com cron ativo,
HTTP 200 e processador saudável; cron Sandbox desativado. O próximo passo é
o checkout e pagamento real do Inicial em empresa comum.
Entrega autenticada, recebimento, ledger e acesso continuam pendentes.
Na tentativa das 17h50–17h53 Manaus, o cliente foi criado, mas a assinatura de
R$1 foi recusada com `invalid_value`. O Asaas informa mínimo de R$5 por cobrança.
O titular autorizou R$5/mês às 18h00. O catálogo foi ajustado e a leitura das
18h01m52s confirmou BRL 500 centavos; o teste pode ser retomado após atualizar
a página e conferir o novo valor. A correção impede novas criações abaixo do
mínimo e explica a causa.
Nenhum novo aceite integral foi atribuído. Ver
[ativação do webhook](evidence/production-webhook-activation-20261018.md) e
[diagnóstico do valor e proposta](evidence/production-checkout-minimum-20261018.md).

Histórico das demais frentes: **3/7, 4/7 e 5/7 — validações reais das duas fixtures**.
Cloud recuperado em 17/10; cobrança publicada passou 25/25 verificações e
os itens 1.2 e 5.1 foram aceitos. Armazenamento pelas APIs autenticadas passou
50/50 checks publicados às 15h06 Manaus, encerrando o item 3.1.
Os dois eventos manuais continuam aguardando revisão real do titular.
O item 7.1 foi comprovado em 05/10, 13h49 de Manaus: chave real autenticada,
aprovação geral, dados comerciais e documentação aprovados. Dados bancários
estão PENDING e são registrados separadamente da aprovação geral.
Os quatro secrets do backend e a correspondência do token GitHub/backend
passaram na consulta privada. Não precisam ser gerados novamente.
Conferência publicada após o titular salvar em 05/10, 14h36 de Manaus:
webhook único no endereço esperado, API v3, sequencial, 13 eventos corretos,
desativado e fila não interrompida. O Asaas retorna o token somente na criação;
a autenticação fica pendente da entrega real, sem repetir o cadastro.
O agendador privado Sandbox foi registrado às 16h20. Entre 16h21 e 18h16,
24 disparos ocorreram a cada cinco minutos, com 24 respostas HTTP 200 e
telemetria saudável. O alerta real de heartbeat antigo chegou à caixa do
operador às 16h19; o diagnóstico agendado posterior confirmou recuperação.
O item 6.1 foi aceito em Sandbox; naquele checkpoint, agendamento/alertas de
Produção permaneciam no gate 7.2, agora concluído pela prova de 19/10 acima.
Ver [prova histórica](evidence/database-scheduler-20261005.md).
Os dois dead letters foram consultados no provedor: mesma cobrança Sandbox,
RECEIVED, 500 centavos, vencimento 29/09, sem assinatura informada na resposta
e sem pagamento local correspondente. Não autoriza atribuição de acesso ou
replay. O responsável confirmou que era cobrança manual no Asaas; o fluxo
[de revisão auditada](STAGE-07-EXTERNAL-TEST-REVIEW.md) permite encerrar testes
externos Sandbox com Master/AAL2, sem alterar pagamentos ou acesso.
A decisão real dos dois eventos permanece pendente.
Ver [revisão](evidence/inbox-review-20261005.md).
Meta de continuidade: [dez de 23 aceites](TARGET-10-OF-23.md), solicitada em
05/10, 20h35 Manaus. A consulta de 00h35 UTC confirmou os dois eventos ainda
pendentes e nenhuma auditoria de conclusão. Frente independente registrada em 06/10:
**4/7, item 4.3**, referências, renovação e isolamento de arquivos privados.
Ver [implementação e limites](PRIVATE-FILE-ACCESS.md); links históricos e
validação autenticada publicada continuam pendentes, sem novo aceite integral.
Aceites finais no checkpoint de 19/10: **7/23 — 30,43%**; restavam 16 itens parciais/em aberto e nenhuma
etapa inteira foi encerrada. A meta de pelo menos 20% do total foi atingida,
sem alterar os 23 critérios. Ver [provas de 17/10](evidence/acceptance-20-20261017.md).
Ver [prova e revisão](evidence/production-preflight-20261005.md) e
PRODUCTION-ACCESS-SETUP.md. A janela
offline de 72 horas mantém seus aceites de execução/distribuição em aberto;
as demais frentes conservam seus aceites em aberto.
Produção saiu da antiga etapa 09 e ganhou a etapa técnica 10, tornando explícita
a conexão necessária para receber dinheiro real.

| Ordem restante | Documento técnico | Critério para encerrar |
| --- | --- | --- |
| 1/7 — Eventos e reconciliação | 04 | Duplicata sem duplicar pagamento/acesso; perda de webhook recuperada; eventos fora de ordem; dois dead letters revisados individualmente e replay autorizado com evidência Asaas. |
| 2/7 — Ciclo da assinatura | 05 | Renovação, atraso, carência, suspensão, estorno/chargeback, cancelamento e reativação comprovados; dados do backend preservados; acesso online e prazo offline coerentes, com exclusão local no vencimento conforme decisão do responsável. |
| 3/7 — Armazenamento | 06 | Upload, bloqueio por limite, falha/retentativa e exclusão nos módulos disponíveis: caso, paciente, foto e avatar; reserva e tamanho real consistentes; concorrência; revisão individual de reservas e objetos históricos; prova em Web e aplicativos instalados. |
| 4/7 — Segurança, identidade e Master | 07 + revisão de segurança da 09 | Cadastro/confirmação/recuperação de senha; política aplicada no Auth; sessões reais, MFA e troca/logout; tentativas de acesso a outra empresa/elevação de privilégio/replay em AAL1 recusadas; arquivos privados; revisão de secrets, superfícies públicas e ações administrativas; resultados e riscos registrados. |
| 5/7 — Gestão pelo cliente | 08 | Histórico e cobrança corretos; cancelamento/troca executados no Asaas uma vez; preço e vigência explícitos, downgrade compatível com limites e reconciliação após falha. |
| 6/7 — Operação e preparo do beta | 09 | Revisão publicada confirmada; worker regular e monitorado; alerta entregue e incidente ensaiado; backup/restauração/rollback; fluxo de cliente novo em Sandbox de ponta a ponta; paridade Web/Windows/Android; limites de capacidade medidos para o lote piloto; termos, privacidade e suporte preparados para revisão antes da oferta. |
| 7/7 — Asaas Produção e liberação | 10 | Conta recebedora conferida; API key e token de webhook exclusivos de Produção no backend; endpoints, eventos, fila e agendador com ambiente correto; cobrança real controlada autorizada, recebimento e acesso comprovados; aprovação explícita do lote beta e acompanhamento ativo. |

## Evidência atual e regras de continuidade

- Consulta real de Produção em 05/10, 17h49 UTC, registrada na execução
  37350659436: credentials_valid=true e general=APPROVED. O contrato v1
  calculava account_approved pelo conjunto dos quatro campos; seu false não
  representa ausência de aprovação geral. O contrato v2 separa aprovação
  geral de cadastro integral. Ambiente financeiro permanece Sandbox e
  production_enabled=false; não houve cobrança, envio de evento ou replay.
- Fundação, restore e primeiro checkout pago Sandbox têm evidência histórica.
  Não contam como comprovação de pagamento de Produção.
- SELECT de 04/10 às 13h35 de Manaus confirmou último heartbeat Sandbox em
  09h29:31, status ok, contadores de falha/revisão iguais a zero. Um único
  registro, já antigo, não comprova regularidade do cron.
- Plano Inicial no banco: 100 centavos. Zero pagamentos de Produção registrados.
  Contratos Sandbox existentes mantêm o preço contratado; mudar o catálogo
  não reajusta automaticamente uma assinatura.
- A política geral do Supabase Auth não é exposta pelo conector de SQL/Lovable.
  Corrigir as telas e as funções da equipe não comprova a recusa de senha fraca
  diretamente no Auth. A configuração e os testes com conta isolada continuam
  sendo um aceite obrigatório de 4/7.
- Em 04/10, 22h44 de Manaus, o responsável retomou a preparação financeira e
  informou que fará a primeira compra real de R$1 após as conferências de
  Produção. Configuração, aceites e pagamento ainda não foram comprovados;
  esta decisão não executa cancelamento, estorno ou replay de ocorrências antigas.
- DICOM está adiado até Radiologia funcionar; suas proteções permanecem.
- Nenhuma etapa será encerrada por mocks, teste SQL de metadata sintética ou
  compilação nativa isoladamente. Os testes necessários em aparelhos e no
  provedor precisam de evidência própria.

Os protocolos completos de desempenho/capacidade e Segurança DentalFlow
continuam separados. Os requisitos mínimos acima são gates desta liberação;
não representam certificação de ausência de falhas ou invasões.

## Continuidade de 05/10/2026 — identidade e documentos operacionais

Etapa atual: **4/7**. O relatório mais recente do Lovable informa login real,
MFA, logout/revogação e isolamento das duas fixtures mantidas. Senha de sete
caracteres foi recusada (HTTP 422); isso não determina o mínimo exato nem prova
cadastro/confirmação por e-mail. Recuperação e replay financeiro não foram
comprovados. Leitura Master em AAL1 é comportamento previsto; replay exige AAL2.

O plano jurídico de preparação da etapa 6/7 está em
[LEGAL-OPERATIONS-PROTOCOL.md](LEGAL-OPERATIONS-PROTOCOL.md), com oito ações,
dependências e critérios para redigir e revisar os documentos posteriormente.
Não autoriza cobranças, uso clínico secundário nem publicação de minutas.

A revisão encontrou URLs assinadas persistidas por um ano em anexos de pacientes
e dez anos em fotos/avatar. A correção exige renovação autorizada, isolamento
do cache por conta e tratamento das URLs antigas sem apagar arquivos clínicos.
Permanece como aceite aberto de 3/7 e 4/7.

Nesta rodada passaram 209 testes em 14 arquivos (armazenamento, Master, Auth,
billing e licença Desktop), mais verificações estáticas das etapas 06/09 e
bootstrap Desktop. São provas locais de regressão, não substituem aceites reais.
Nenhuma das sete etapas foi encerrada; nenhum crédito de chat Lovable foi usado.

## Preparação de recebimentos — 04/10, 22h45–22h52 em Manaus

Frente atual: **6/7 — operação**, preparando requisitos de **7/7 — Produção**.
As sete etapas permanecem com aceites abertos. Plano Inicial ativo confirmado
no banco por 100 centavos BRL. Sandbox tem cinco eventos processados e dois
dead letters por `PROVIDER_RECONCILIATION_FAILED` (recebimento e atraso,
seis tentativas cada); não foram reenviados. Produção ainda sem comprovação.

PRs 124 (branch SaaS) e 125 (ponte isolada da main) integraram seleção explícita
de ambiente no agendador e diagnóstico, padrão Sandbox, habilitação de
Produção e token separado. O diagnóstico exige o ambiente correto retornado.
Nenhum secret ou variável foi alterado. Sem mudança na interface ou chamada
ao Asaas nesta rodada. CI dos dois candidatos e restauração do candidato
SaaS passaram, incluindo as barreiras de identidade/cota/preço/replay em
banco isolado; 124 testes locais de billing/licença também passaram.

Recibos: CI SaaS 37256841112; restaurações 37256840825 e 37256843998;
CI ponte main 37256841264 e 37256845074. Esses resultados não comprovam
conta recebedora aprovada, publicação servida ou pagamento real.

O responsável informou ter acesso ao Asaas, mas não conhecer o status da conta.
Conferir cadastro e modalidade de R$1, depois cadastrar secrets e webhook de
Produção nos painéis apropriados. A ferramenta conectada não oferece configuração
de secrets. Ver sequência e campos em STAGE-10-PRODUCTION-READINESS.md.

## Decisão adicional: aplicativos offline

O responsável determinou limite de 72 horas, limpeza local e bloqueio após
o vencimento. Regra, limites, perda de alterações não sincronizadas e aceites
por plataforma estão em [OFFLINE-72-HOURS.md](OFFLINE-72-HOURS.md).
O contador verificável é [ACCEPTANCE-PROGRESS.md](ACCEPTANCE-PROGRESS.md);
implementação parcial não equivale a autorização para vender.

## Continuidade de 08/10/2026 — execução real bloqueada no Cloud

O PR154 integrou os três tipos de job privado, com sessões reais em memória e
capacidade dedicada de uso único. A validação de cobrança é exclusiva de
Sandbox, com notificações desabilitadas, contrato conferido no provedor,
ledger único e documento real. Armazenamento exercita caso, paciente, foto e
avatar com reserva, quota, isolamento e limpeza dos próprios objetos de teste.
Isso prepara os aceites; não os conclui.

Passaram 414 testes em 22 arquivos, build e CI. Restore reproduz 175 migrações.
A migração de limite empresarial para leitura de avatares foi aplicada às
19h59min47s UTC; links históricos ainda exigem tratamento próprio. A publicação
do PR154 foi solicitada, mas a sondagem publicada respondeu HTTP503; o diagnóstico
não vincula os logs explicitamente ao HEAD e não comprova a publicação servida.

O job de identidade enviado retornou HTTP403 antes da claim e não alterou
contas. O diagnóstico independente confirmou backend_unreachable_db e
HTTP503 na conexão Auth→banco; o motivo específico do 403 não foi exposto.
A consulta SQL ficou indisponível. A prioridade operacional é recuperar o
Cloud, conferir a publicação e preparar uma nova execução, preservando
contratos, ledger, dados clínicos e a janela offline de 72 horas.

O mínimo global de senha (oito caracteres) permanece pendente no painel Auth.
As duas revisões manuais externas continuam exigindo a sessão Master/MFA do
titular. Os cenários de webhook perdido, ciclo financeiro completo e
preservação clínica não foram executados. Nenhum novo pagamento de Produção
ou aceite integral foi registrado. **2/23 — 8,70%; 21 itens ainda abertos/parciais.**

O diagnóstico pelo [plugin Lovable](https://lovable.dev/projects/a8b717e3-87ad-482d-8d4a-de81679507e0)
consumiu 1,5 crédito; somado à consulta Auth de 0,8, o uso nesta continuidade
foi de 2,3 dos cinco créditos autorizados. Não equivale ao saldo total da conta.
[Evidências e sequência concreta de retomada](evidence/fixture-cloud-checkpoint-20261008.md).
