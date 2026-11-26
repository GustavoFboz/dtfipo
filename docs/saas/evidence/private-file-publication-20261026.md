# Publicação clínica e validação dos arquivos privados — 26/10/2026

Checkpoint de 26/10, 11h16 Manaus. **10/23 aceites integrais (43,48%),
13 restantes e 1/7 etapas encerradas.** A entrega clínica e os novos testes
não substituem os critérios completos. Para ultrapassar 50%, são necessários
12/23 (52,17%); os candidatos 3.2 e 4.3 conservam as pendências abaixo.

## Versão web disponível

A [PR197](https://github.com/GustavoFboz/dtfipo/pull/197) recuperou as operações
idempotentes ausentes de criação de paciente/caso e a confirmação de edição.
Os vínculos do caso são gravados em uma transação; retentativas conservam a
identidade da operação. A edição só confirma sucesso após reconhecer uma linha
alterada. Passaram 167 testes locais, tipos, CI e restauração completa. O código
novo foi observado no asset público com HTTP200; as operações também foram
conferidas no banco. É possível atualizar a página e retomar o uso da Web.
O restante do SaaS pode avançar em paralelo.
[Recibo clínico e preservação](clinical-creation-publication-20261026.json).

As [PR198](https://github.com/GustavoFboz/dtfipo/pull/198) e
[PR199](https://github.com/GustavoFboz/dtfipo/pull/199) publicaram a rotação
controlada de referências privadas, a resolução autorizada de endereços antigos
e uma retentativa limitada quando a imagem usa uma assinatura em cache.
Respostas substituídas não voltam ao cache; o limite offline continua 72h.
O GET da rota de manutenção retornou HTTP200 com o contrato somente leitura
`dentalflow-private-file-rotation-v1`. O estado inicial do deploy nativo era
`pending`; o recibo conserva esse estado e a observação pública independente.

## Prova publicada com arquivos descartáveis

O job `343d2f26-71f2-4ef0-977d-5172b2159d29`, concluído às 11h12m26 de Manaus,
passou **134/134 verificações**: 112 regressões de Storage/privacidade e 22
verificações novas dos links. Sessões USER reais das duas contas fixas
`example.invalid` enviaram os arquivos e exerceram as permissões normais.
Nenhum papel foi promovido e nenhum usuário real foi impersonado.

Cada avatar descartável foi assinado, aberto, vencido e recusado; outra
assinatura de cinco minutos foi emitida. A cópia em endereço novo teve tamanho
e SHA-256 conferidos, referência/cota foram trocadas atomicamente e só então
os bytes antigos foram removidos. O link originalmente emitido passou a
retornar HTTP400; o dono resolveu o endereço novo e a outra empresa foi
recusada. Uma reserva válida também não permitiu reutilizar o endereço antigo.
Os dois jobs filhos encerraram com um alvo verificado cada.

A limpeza retornou as cotas de teste a zero: nenhum objeto, registro de cota,
paciente ou avatar desse job permaneceu. Os recibos privados de auditoria
foram conservados. Nenhum dos quarenta arquivos históricos entrou nesses jobs.

## Preservação e limites

Após o job: 86 casos, 104 pacientes, 691 registros de armazenamento e
9.388.798.587 bytes contabilizados. Hashes de casos, dados de pacientes/perfis
fora dos campos de imagem, pagamentos, contrato financeiro estável e catálogo
de cotas conferem com a leitura anterior. Há um pagamento de Produção; nenhum
novo pagamento foi disparado nesta validação. A reconciliação normal pode
atualizar seus próprios horários, por isso a comparação financeira usa os
campos estáveis do contrato.

O estoque observado tem 122 itens e 50 movimentações, todos da IPO, sem
divergência entre o dono da movimentação e o item. As duas movimentações novas
foram criadas às 14h26 UTC, antes do job de arquivos iniciado às 15h11 UTC.
Este trabalho não escreveu no estoque. O checkpoint de 24/10 com 48
movimentações permanece histórico.

Tipos, 41 testes locais de imagens, stage-06/stage-09, CI Web e restauração
das 183 migrações passaram. Windows gerou o instalador no CI, sem publicação
nova nem aceite em aparelho físico. Os dois APKs compilaram. A primeira
tentativa API35 falhou no dump UiAutomation com descritor inválido e recebeu
uma retentativa específica; API37 falhou no serviço settings do emulador antes
do smoke. O recibo distingue esses resultados do aceite em aparelhos.

## Ações concretas para os próximos aceites

**3.2:** as nove reservas vazias, somando 1.112.944.862 bytes, continuam
presentes. O titular já autorizou a liberação; a sessão gestora remota não
concluiu o login. A ação disponível é **Armazenamento → Envios pendentes →
Liberar espaço**, com a conta gestora real, seguida da conferência de cota,
ausência de objetos e preservação dos vínculos. Não houve DELETE direto nem
forja de sessão para contornar essa exigência.

**4.3:** o inventário somente leitura reconfirmou **34 fotos e seis avatares,
1.273.134 bytes**, cada um com objeto e exatamente um registro de cota pronto.
Nenhum alvo histórico foi preparado ou executado. A execução proposta copia
e confere os bytes, altera somente o endereço e o caminho do mesmo registro
de cota, remove somente a cópia antiga e exige a recusa do link originalmente
emitido. O leitor autorizado obtém o endereço novo; IDs, donos, vínculos e
cotas são mantidos. Cópias externas já baixadas não podem ser revogadas.

A revisão automática rejeitou o POST vazio usado para verificar publicação,
por considerar que um POST de manutenção poderia iniciar mudanças reais sem
autorização específica. A tentativa rejeitada não moveu arquivo algum. Foi
substituída por GET somente leitura e pelos testes descartáveis autorizados,
sem repetir a ação rejeitada. A rotação dos quarenta arquivos históricos
aguarda autorização específica do titular; o critério 4.3 continua parcial.

[Recibo completo sem imagens, caminhos privados ou tokens](private-file-publication-20261026.json).
