# Plano e preço por vigência publicados — 28/10/2026

Checkpoint de **28/10/2026, 18h00 Manaus** (22h00 UTC). A PR206 foi integrada
e publicada. A execução financeira de troca de plano, o preço por período e a
aplicação condicionada a pagamento/data/limites estão implementados. A rodada
publicada passou **18/18 verificações reais de observação e autorização**,
preservando contratos, arquivos e dados. Não houve execução financeira.
**12/23 (52,17%), 11 restantes, 1/7 etapas encerradas; nenhum novo aceite integral.**

## Revisão e publicação

- PR206: https://github.com/GustavoFboz/dtfipo/pull/206.
- Head `506183b3edfb1cd1898c96fd6e9ace00b97c262b`; merge
  `d98fe9c77393e77eeb288d5f7bdc497b022a3cd1`, sobre a revisão publicada
  `2d9986389dcbbf45dc0e8bd5ac4b3fec8ff5648b`. Histórico preservado.
- Migração `20261028210000_saas_plan_price_periods.sql` aplicada em transação
  com limites de espera e execução. As assertivas somente leitura passaram;
  tabelas privadas, nenhum termo ou execução financeira criado.
- Publicação `5e330202-8ad8-4abe-b9d7-bf6e608d4524`, inicialmente `pending`.
  O manifesto público confirmou as **185 migrações** às 21h58m27 UTC; o novo
  código foi confirmado pelo contexto de preços e pela recusa na nova rota no
  recibo real de https://dtfipo.lovable.app.
- O rollout da nova execução financeira em Produção não foi habilitado nesta
  rodada. A homologação protegida Sandbox continua necessária.

O [contrato da implementação](../PLAN-PRICE-PERIODS.md) descreve cotação
congelada, Master/AAL2, escrita única, conferência por GET após ambiguidade,
faturas preservadas, três preços distintos e aplicação do plano na data
correta. O processador acrescenta uma RPC local por execução, em lote de até
dez contratos; não chama o Asaas para ativar permissões nem amplia as 72h offline.

## Verificação técnica e falhas conservadas

Passaram **413 testes locais em 21 arquivos**, tipos, build, etapas 06/08/09,
contrato estático da nova implementação, bundle determinístico e diff. A CI
Web `40774767428`, Windows `40774767399` e restauração limpa
`40774767462` terminaram com sucesso na revisão final. O ensaio descartável
inclui preços por data, autorização, escrita única, retomada, pagamento
antecipado, excesso de uso e aplicação posterior sem exclusão.

As tentativas anteriores de restauração continuam registradas:

| Execução | Falha e correção |
| --- | --- |
| `40773429828` | Função de cancelamento já existente no bundle; as cópias passam a usar `CREATE OR REPLACE`, preservando funções e grants. |
| `40773785761` | Assertiva de excesso no ensaio; passou a usar a cota efetiva da cotação, incluindo cortesia/adicionais, e leitura posterior à mutação. |
| `40774205768` | Assertiva final de ativação; ativação e consulta do resultado foram separadas em instruções SQL. O runtime não mudou entre essa tentativa e a aprovada. |

Essas fixtures e provas artificiais existem somente na CI descartável com
rollback. Não foram executadas no banco ativo nem contadas como MFA, pagamento
ou aceite real. Restore limpo de schema não encerra backup/restauração
operacional de dados e arquivos.

Android API35 passou, inclusive smoke (`123121045912`). API37 compilou o APK,
mas falhou no smoke (`123121046187`), com ANR/timeout de despacho de entrada
registrado nos diagnósticos. O workflow geral `40774767383` aparece verde
porque essa matriz permite falha. Publicação permanente foi ignorada; aparelhos,
Android17 e expiração/limpeza offline conservam seus aceites próprios.

## Observação real sem execução financeira

O job `5ffcdc35-a88c-42de-85a6-17f08a5a5453` foi chamado uma vez e passou
**18/18 checks**. A capacidade foi consumida e sua cópia local removida.
O backend usou as duas fixtures USER já autorizadas, sessões verificadas pelo
Auth e somente leituras sequenciais no provedor, com notificações desativadas.

Foram confirmados preço de R$449, ausência de novos termos, assinatura ativa,
três cobranças inalteradas, dois pagamentos e acesso pago. Outra empresa foi
recusada ao consultar o histórico; o gestor comum recebeu HTTP403 nas ações
Master de cancelamento e de troca de plano. Não houve promoção de usuário,
claims MFA artificiais ou autorização financeira pelo worker.

O pedido existente `5cd49826-9cec-421d-b511-98519ecdd80e` foi reutilizado para
observação: `cancel / sandbox / awaiting_provider / AWAITING_MASTER`, sem
tentativa financeira. Não houve nova submissão. A rodada anterior tinha 17
checks incluindo cotação/submissão inicial; esta remove essa verificação já
concluída e acrescenta contexto de preços e recusa na nova rota, totalizando 18.

## Integridade e carga observadas

Snapshots de 21h50m32 e 22h00m03 UTC coincidem nos doze campos de preservação:

| Dado | Antes e depois |
| --- | --- |
| Arquivos prontos / bytes | 700 / 8.357.682.562 |
| Reservas | 0 |
| Storage | `e6d2b3b7155123e1c0b6f184f9f50fa1` |
| Casos | `419b08f5b8905de5caa4fa9616ed4db6` |
| Pacientes | `d1573a1878b4cc6ab9f2d2b3143b3f2d` |
| Pagamentos | `b2c430d6aaed7c02409aca88b4b649ea` |
| Contratos fora das fixtures | `5f93ae8a05622562813e88f6797b522d` |
| Preços/status dos contratos | Quatro registros idênticos; digest no JSON |
| Novos termos / execuções de troca / execuções de cancelamento | 0 / 0 / 0 |

Ambas as fixtures mantêm plano, preço e período pago até 18/12/2026. A
comparação de contratos exclui somente campos operacionais de atualização e
reconciliação conforme o snapshot; não exclui plano, preço ou vigência.
O pedido único também permanece idêntico.

Havia 53 conexões no início, 60 na conferência intermediária e 51 no fim,
sem espera por locks observada. Um único job foi executado; nenhum retry
automático, mudança de cron ou chamada financeira ocorreu. O worker Produção
estava `ok`, com último heartbeat saudável às 21h56m32 UTC. São observações
pontuais, sem certificação de capacidade. Os 685 arquivos de 27/10 permanecem
uma contagem histórica; esta rodada começou e terminou com 700.

## Próxima sequência de aceite

1. Revisar o cancelamento existente na sessão Master real, confirmar o
   autenticador e executar uma vez; ambiguidade exige conferência por GET.
2. Observar o resultado, comparar cobranças, ledger, período e hashes; não
   recriar o pedido nem fabricar autorização por SQL.
3. Em fixture independente, cotar e validar troca de plano/preço no Sandbox
   com Master/AAL2, pagamento e aplicação na data correta. Calendário divergente
   ou cobrança futura emitida exige revisão explícita antes de prosseguir.
4. Comprovar downgrade, excesso de uso, recuperação de falhas e os demais
   ciclos. Manter o rollout da nova ação em Produção fechado até a homologação.

Os itens 5.2/5.3, 2.1/2.2 e aparelhos continuam parciais. Não foi reaberto o
login Master nesta rodada. O [recibo e os snapshots sanitizados](plan-price-periods-20261028.json)
omitem credenciais, URLs de cobrança, dados fiscais e preços/IDs de contratos
reais fora das fixtures.
