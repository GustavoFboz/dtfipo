# Propriedade por empresa: publicação e verificação real

Em 23/10/2026, entre 09h21 e 09h24 de Manaus, a publicação contendo a
propriedade de estoque passou **186/186 verificações reais**, em três jobs
privados e sequenciais. O contador oficial permanece **8/23 (34,78%)**:
o isolamento entregue é parte do item 4.2, que ainda tem outros aceites.

## Publicação comprovada

- Revisão publicada: `b2a115fa806c9ac8b89a3864c9f7d76755d9b553`, contendo
  a implementação da PR185 e o registro da aplicação ao banco da PR186.
- Deployment nativo: `19c804bd-80ad-4ed0-9bf8-e97e155c013e`.
- O editor exibiu **“Seu site foi atualizado”**. Não foi usado o builder AI.
- O GET público da nova migração retornou HTTP200 e blob Git
  `88d1063d4a1a3b964b555df10e391ad5f15304f1`, exatamente igual ao GitHub.
- A execução real do novo job `ownership` confirmou o código publicado.

## Resultados persistidos

| Job | Verificações aprovadas | Prova |
| --- | --- | --- |
| Propriedade | 58/58 | [Recibo](company-ownership-receipt-20261023.json) |
| Identidade | 16/16 | [Recibo](company-identity-regression-20261023.json) |
| Arquivos e privacidade | 112/112: 84 de Storage e 28 de autorização/atividades | [Recibo](company-storage-regression-20261023.json) |

Cada job usou uma capacidade de uso único e somente as duas fixtures fixas.
Os recibos foram gravados pelo backend, com capacidades consumidas. Leituras,
recusas e consumo usaram sessões USER reais, sem promoção nem claims simulados.
O preparo administrativo criou somente UUIDs descartáveis conhecidos pelo job.

Os 17 domínios de estoque e profissionais foram lidos por ambas as contas:
cada usuário encontrou somente seu próprio registro. Perfil estrangeiro,
falsificação de empresa e combinação de caso próprio com estoque estrangeiro
foram recusados. O consumo autorizado passou de 10 para 9; a reversão repetida
restaurou 10 uma única vez, com duas movimentações da empresa correta.

A regressão de identidade repetiu confirmação, login, recuperação, uso único,
logout e recusa de credencial curta. A de arquivos repetiu os quatro buckets,
cota, concorrência, falha/interrupção, leitura e exclusão por outra empresa,
preservação dos bytes e privacidade dos marcadores de leitura.

## Conferência independente após os jobs

O [snapshot agregado](company-ownership-runtime-snapshot-20261023.json), das
09h25 Manaus, confirmou as 22 tabelas sem resíduos das fixtures nem registros
sem empresa. A IPO conserva 107 itens, 47 movimentações, 45 campos, duas regras,
dois consumos, 29 componentes por dente e os 14 profissionais. Os diretórios
concordam com os perfis; as guardas de schema ativo passaram novamente.

Não restaram objetos dos jobs no Storage nem reservas ativas das fixtures.
Os próprios recibos confirmam limpeza dos casos/pacientes e restauração da cota.
Produção mantém um pagamento, zero eventos falhos/dead letter e worker `ok`.
Nenhuma chamada financeira ao Asaas ou troca de ambiente foi feita nesta rodada.

## Limites mantidos

Os 12 pacientes sem empresa e sem casos continuam intactos, com origem ainda
não confirmada. Tipos de caso, cores, workflows e demais configurações globais
conservam revisão própria. Master/MFA e replay positivos, nove reservas antigas,
40 links históricos, aparelhos, ciclos financeiros, backup operacional e
liberação comercial continuam com seus aceites. Não há novo instalador
permanente Windows/Android nesta rodada: o backend publicado protege clientes
online anteriores; a nova separação do cache requer o frontend atualizado.

O bloqueio de ambiente registrado em 22/10 foi resolvido nesta retomada. Os
relatórios antigos conservam seu valor histórico, sem serem alterados para
atribuir a eles verificações executadas somente hoje.
