# DentalFlow SaaS — sete etapas restantes até vendas

Atualizado em 05/10/2026, horário de Manaus. Este é o contador de conclusão
apresentado ao responsável. Os IDs 00–10 dos documentos técnicos permanecem
para manter o histórico; não são um segundo protocolo.

**Restam 7 de 7 etapas com aceites em aberto.** Há código e provas parciais
em todas elas; um incremento aprovado não encerra automaticamente a etapa.
Frente atual: **7/7, item 7.2 — conferência do webhook e preparação de Produção**.
O item 7.1 foi comprovado em 05/10, 13h49 de Manaus: chave real autenticada,
aprovação geral, dados comerciais e documentação aprovados. Dados bancários
estão PENDING e são registrados separadamente da aprovação geral.
Os quatro secrets do backend e a correspondência do token GitHub/backend
passaram na consulta privada. Não precisam ser gerados novamente.
Conferência publicada de 05/10, 14h13 de Manaus: webhook único no endereço
esperado, API v3, sequencial e 13 eventos corretos, mas ativo enquanto o
backend permanece Sandbox. O titular deve desativar esse registro durante
a preparação. A listagem não forneceu token comparável; correspondência
e entrega permanecem sem prova. Último heartbeat Sandbox às 05h15 de Manaus;
regularidade do agendamento continua pendente.
Aceites finais: **1/23 — 4,35%**; nenhuma etapa inteira foi encerrada.
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
