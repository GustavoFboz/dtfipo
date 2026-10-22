# Publicação autorizada e identidade — 21/10/2026

Continuidade posterior: o job de Storage corrigido e publicado passou 84/84
verificações em 22/10; a fila do alerta foi correlacionada a outro endpoint.
Ver [novos recibos e limites](authorized-runtime-validation-20261022.md).

O titular autorizou expressamente administrar o Lovable Cloud do DentalFlow,
publicar as atualizações necessárias em Produção e ajustar a política de senhas.
A autorização resolveu o bloqueio registrado no checkpoint anterior.

A publicação nativa `486889a2-09b2-4874-9aa5-b68c4321cfc4` foi iniciada a partir
da revisão GitHub `ef31ce3d26ebdf01769e272b3570c2886e0a7937`. O painel Publish
confirmou “Publicado” e “Seu site está atualizado”, com a ação de publicar
alterações desabilitada. Endereço: https://dtfipo.lovable.app.
O mínimo global de senha foi salvo em oito caracteres no Email settings do
Auth. Nenhuma senha de conta existente foi alterada. O desenvolvimento usa
GitHub; o builder AI do Lovable não foi acionado.

## Aceite 4.1

Job `dfebc679-bf17-4646-afab-2ee8171e4afc`, concluído em
**22/10/2026 03:49:46 UTC / 21/10/2026 23:49:46 Manaus**: **16/16 checks reais**.
O [recibo persistido](identity-20261021.json) registra cadastro descartável,
confirmação, token de uso único, login confirmado, recusa de senha de sete
caracteres com HTTP422, recuperação, recusa da senha anterior, login recuperado,
logout global e recusa do refresh, além das duas sessões USER reais e isolamento
entre as empresas fictícias. O usuário descartável foi removido pelo job.

A chamada sem Authorization foi recusada com HTTP403/JSON antes do claim.
Capacidades foram aleatórias, de uso único, com expiração de dez minutos;
somente seus hashes foram gravados. Links, credenciais e sessões ficaram em
memória no servidor e não fazem parte das provas.

**Item 4.1 concluído; total 8/23 (34,78%); 15 em aberto/parciais; 0/7 etapas
inteiramente encerradas.** MFA, replay administrativo e arquivos privados
conservam seus critérios próprios.

## Storage e diagnóstico operacional — primeira rodada

O primeiro job ampliado de Storage, `958113e9-f464-4384-a373-4c21c6412961`,
concluiu em 03:50:57 UTC com **64/68 checks aprovados**, sem novo aceite.
Passaram os uploads/exclusões dos quatro buckets, isolamento, concorrência de
cota com um único vencedor e recuperação de envio interrompido. O teste de
tamanho esperava recusa já no transporte; o contrato implantado desde 29/09
admite INSERT sem metadado de tamanho e exige a conferência dos bytes reais em
`complete_storage_upload`. A nova validação confere essa recusa, impede liberar
cota com bytes presentes e remove somente seus destinos descartáveis. Ela
precisa de nova publicação e execução. As duas cotas voltaram a zero na primeira
rodada. [Recibo inicial preservado](storage-resilience-initial-20261021.json).
As nove reservas históricas continuam intocadas e aguardam revisão individual
por gestor; item 3.2 permanece parcial.

O diagnóstico manual GitHub [#16](https://github.com/GustavoFboz/dtfipo/actions/runs/39719133655)
confirmou conta e configuração ativa do webhook. A etapa nova de correlação
falhou antes do GET porque faltava checkout do script. A correção adiciona
checkout da revisão selecionada, somente no disparo manual e sem persistir
credenciais. O alerta “Teste Webhook Unika POS” ainda não está correlacionado;
nenhuma fila foi desativada, retomada ou alterada.

Não houve nova cobrança, mudança de plano ou disparo de ensaio de alerta nesta
rodada. Produção, plano Inicial de teste de R$5, contratos históricos de R$1,
isenção IPO e janela offline de 72 horas permanecem preservados.
