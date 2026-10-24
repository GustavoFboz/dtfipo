# Continuidade administrativa — 24/10/2026

Depois dos aceites de eventos/recuperação, o total permanece **10/23
(43,48%), 13 restantes, 1/7 etapas encerradas**. Esta rodada adicional
não atribui um novo aceite.

## Cancelamento no Sandbox com o sistema em Produção

A PR195 corrigiu o bloqueio de configuração: o executor Master pode usar o
grupo Sandbox separado para o ambiente explícito de um pedido. O contrato,
a empresa, o operador e a sessão real AAL2 continuam obrigatórios no claim
SQL antes de qualquer requisição Asaas. Produção mantém o runtime ativo e
sua liberação explícita como requisitos; não há fallback de chaves nem troca
global de ambiente, cron ou worker.

Head `7fe64bd98e9ad5cbfe40124dfb1b2034d3f4d49b`, merge
`1c9f8ada80987463718024489e21666af2cdb7f2`. Passaram 123 testes em sete
arquivos, tipos, verificações SaaS 06/09, CI Web 40131857937 e restore
40131857940 (181 migrações). A publicação nativa
`a6f02e98-c41e-4095-a7c2-f0025b09b10a` terminou; o editor confirmou
“Seu site foi atualizado”.

Nenhum pedido foi cancelado para provar essa mudança. 5.2/5.3 continuam
parciais: execução autenticada real, troca de plano/preço por vigência,
downgrade e falhas reais ainda exigem suas provas.
[Recibo de implementação e publicação](administrative-continuity-20261024.json).

## Nove reservas históricas conferidas

A sessão gestora real abriu a área `/armazenamento`. As nove tentativas de
setembro aparecem individualmente em Envios pendentes. A consulta somente
leitura das 20h55 UTC conferiu cada reserva: todas pertencem à empresa interna,
todas têm mais de 24 horas, **nenhuma possui objeto no Storage ou vínculo de
anexo/source_id**. Somam **1.112.944.862 bytes (1,04 GiB / 1.061,39 MiB)**.

A idade e a ausência de bytes tornam a liberação tecnicamente elegível, mas
não substituem a confirmação do titular de que os envios foram abandonados.
O fluxo autenticado remove somente o registro da reserva após nova conferência;
nenhum arquivo existente seria apagado por essa ação. A exclusão dos registros
antigos ainda **não foi executada**; pede-se confirmação específica antes
dessa etapa definitiva. Não se executou DELETE por SQL nem se fabricou sessão.

O item 3.2 conserva a resiliência real já aprovada (84 checks) e esta revisão
individual; a liberação das reservas permanece pendente da confirmação de
abandono. Nomes de pacientes, nomes/caminhos de arquivos e IDs clínicos não
foram publicados no recibo.
[Presença/vínculos e tamanhos por reserva](historical-reservations-review-20261024.json).

## Android API37: tentativa preservada e bloqueio identificado

A PR194 testou `-gpu software` na imagem API37 após o crash do backend
anterior. O CI 40131632224 aprovou API35, mas API37 voltou a abortar com
`hasReadColorBufferDma`. O tombstone identifica o **system_server**,
thread **TaskSnapshotPer**, durante cópia/persistência do snapshot pelo
mapper ranchu. A mudança de backend não resolveu a falha do emulador.

A PR foi devolvida a rascunho, com resultado real registrado e **sem merge
nem publicação**. Nenhum teste foi retirado ou relaxado para produzir um
verde. Não há novo instalador permanente nem homologação em aparelho/iOS.
[Jobs e erro seguro](administrative-continuity-20261024.json).
