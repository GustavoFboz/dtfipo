# Fluxos por empresa: publicação e verificação real

Em 23/10/2026, às 11h09–11h12 de Manaus, a publicação passou **227/227
verificações reais**, em quatro jobs privados e sequenciais. O total oficial
permanece **8/23 (34,78%)**, com o item 4.2 parcial.

## Publicação e preservação

- PR188 integrada sem reescrever histórico; revisão publicada
  `91983700eaa9873c7835790e821888cc5b43b09e`.
- Deployment nativo `8e33c71d-c4a9-43e2-82ef-d36134c375a1`; o editor confirmou
  **“Seu site foi atualizado”**. Desenvolvimento pelo GitHub, sem builder AI.
- GET público da migração: HTTP200, 39.836 bytes, blob Git
  `e292d03d504fe590a04b41eb839fe53575342289`, idêntico ao repositório.
- Aplicação ativa transacional comparou contagens e hashes dos campos históricos
  em **20 tabelas**, antes e depois. Resultado: `historical_fields_preserved=true`.
- Os sete domínios de configuração agora possuem empresa. Somados aos 22 de
  estoque/diretórios, são **29 tabelas com propriedade**, além de dois catálogos
  padrão compartilhados somente para leitura.

As fases, etapas, responsáveis, templates, justificativas e configurações da
IPO conservaram seus IDs e valores. Cada outra empresa recebeu somente padrões
do repositório. Salvar um fluxo usa a própria empresa; aplicar a casos abertos
preserva outras empresas e casos finalizados. Avançar um caso antigo conserva
sua versão. Profissionais externos autorizados leem somente as definições dos
casos compartilhados, sem ganhar administração da empresa parceira.

## Resultados persistidos

| Job | Verificações aprovadas | Recibo |
| --- | --- | --- |
| Configuração | 41/41 | [Recibo](workflow-configuration-receipt-20261023.json) |
| Estoque e propriedade | 58/58 | [Recibo](workflow-ownership-regression-20261023.json) |
| Identidade | 16/16 | [Recibo](workflow-identity-regression-20261023.json) |
| Arquivos e privacidade | 112/112: 84 de Storage e 28 de autorização/atividades | [Recibo](workflow-storage-regression-20261023.json) |

Somente as duas fixtures USER fixas, com sessões Auth reais e capacidades de
uso único. Sem promoção de papéis ou claims simulados. O novo job confirmou
leituras próprias, recusa de falsificação de empresa, exigência de gestor para
editar/resetar, catálogos protegidos, avanço/retorno autorizado e recusa de
caso, etapa ou justificativa estrangeiros. Todos os jobs confirmaram limpeza.

O [snapshot independente](workflow-runtime-snapshot-20261023.json), das 11h13
Manaus, reconferiu 29 tabelas sem registros sem empresa. Permanecem 86 casos
IPO, 107 itens, 47 movimentações, 45 campos, 14 profissionais, dez fases,
46 etapas, quatro templates e três atribuições de etapa da IPO. As duas fixtures
conservam seus oito templates padrão; isso não é resíduo descartável.

Não restaram casos/pacientes temporários, linhas do job de configuração,
objetos do job no Storage ou reservas ativas das fixtures. Atividades (1.353) e
marcadores de leitura (775) mantiveram os totais. Produção conserva um pagamento,
zero eventos falhos/dead letter e worker `ok`. Nenhuma operação financeira ou
troca de ambiente Asaas foi executada.

## Regressões e plataformas

Passaram 167 testes locais e a verificação de tipos. O build web e todos os
gates SaaS/entitlement do CI passaram no run `39975091593`. O restore limpo de
180 migrações passou no run `39975091494`, incluindo versões com/sem aplicação,
casos finalizados, gestor de outra empresa, colaborador externo autorizado,
upsert anterior de configurações, conflito de empresa e gatilho de catálogo
mesmo em função privilegiada. Esses cenários administrativos são ensaios SQL
descartáveis, não prova de login real de gestor/MFA.

O Android API35 concluiu build e testes do app instalado no run `39975091928`.
O APK API37 experimental compilou, mas seu teste falhou com timeout de
`ApkAssets.finalize()` e queda de `system_server`; não é aceite de aparelho.
O Windows concluiu a geração e verificação do instalador no run `39975091568`;
a etapa de assinatura Authenticode foi pulada, portanto não é prova de assinatura.
Não foi publicado novo instalador permanente Windows/Android. As guardas de
cache e seleção exigem o frontend instalado atualizado; a autorização offline
de 72 horas continua preservada.

## Limites mantidos

Os 12 pacientes sem empresa e sem casos continuam intactos, com origem não
confirmada. Master/MFA e replay positivos reais, nove reservas históricas,
40 referências antigas, ciclos financeiros, aparelhos, backup de dados/arquivos
e liberação comercial conservam seus aceites. A configuração por empresa e os
catálogos padrão foram tratados nesta rodada; não encerrar todo o item 4.2 por
essa prova parcial.
