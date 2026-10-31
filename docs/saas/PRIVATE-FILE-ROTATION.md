# Rotação dos endereços privados antigos

Concluída em 27/10/2026, 12h42 Manaus, após autorização explícita: 34 fotos e
seis avatares com cópias verificadas, referências e cotas preservadas, origens
ausentes e quarenta URLs originais recusadas com HTTP400. **Critério 4.3
concluído; 12/23 (52,17%)**. Uma resposta 503 foi recuperada somente após a
trava expirar, reutilizando alvo/hash e sem repetir os catorze jobs concluídos.
[Prova, integridade e limites](evidence/private-file-rotation-20261027.md).
Os registros datados abaixo conservam a preparação e os limites anteriores.

Implementação de 26/10/2026, ainda sujeita às provas publicadas. O inventário
confirmou 34 fotos e seis avatares, todos com objeto e exatamente um registro
de cota. A preparação desta implementação não revoga links e não encerra o
critério 4.3.

Um administrador prepara uma capacidade de uso único, com prazo de quinze
minutos, para uma lista fechada de até quarenta objetos. O endpoint não aceita
ator, caminhos, URLs nem novos destinatários pelo HTTP. Origem de navegador é
recusada; somente o backend pode consumir a capacidade e a lease. Chaves, links
assinados e imagens não aparecem no recibo nem no GitHub.

A operação lê os bytes, cria uma cópia em endereço novo sem sobrescrever,
confere tamanho e SHA-256 e altera referência e caminho do mesmo registro de
cota em transação. Só então remove o objeto antigo pela API de Storage. A
confirmação exige ausência no catálogo Storage, cópia íntegra e recusa HTTP do
link originalmente emitido, sem trocar sua query para contornar cache.

Em falha antes da troca, o original permanece. Se a resposta se perde depois,
a retomada confere o destino e o hash registrados antes de continuar. Referência
concorrentemente alterada exige revisão. Uma falha ou cache ainda atendendo o
link antigo impede contar a revogação. A retomada reutiliza o job e os destinos;
não recria objetos em caminhos antigos.

Os caminhos antigos ficam permanentemente recusados para novos uploads, mesmo
com reserva válida. O histórico pode continuar contendo sua referência original:
o adapter pede a referência substituta somente quando a assinatura original
falha, e a RPC exige autorização atual para aquele paciente/avatar. O resultado
ainda é assinado pelo Storage normal por cinco minutos, sob RLS.

A cota, os IDs, o dono, vínculos clínicos, nomes e textos históricos são
preservados. Não há reatribuição dos doze pacientes sem origem conhecida. A
camada instalada conserva o teto de 72 horas; os testes em aparelhos mantêm
seu aceite separado. Bytes já baixados anteriormente não podem ser apagados de
cópias externas por essa operação.

A manutenção processa um arquivo por vez, sem concorrência entre os alvos.
Ao primeiro erro, interrompe os próximos arquivos e registra o recibo parcial;
os alvos ainda não iniciados permanecem preparados para revisão. A conferência
de cópia, hash, referência e recusa do endereço antigo continua obrigatória.
Essa execução sequencial limita as requisições durante o uso normal do sistema.

A validação cobre o SQL em banco descartável com rollback, o adapter e a ordem
de efeitos sob falhas. O job privado de Storage usa sessões USER reais e gira
somente seu avatar descartável, incluindo assinatura curta, vencimento,
renovação, recusa estrangeira e tentativa de reutilizar o caminho com reserva
válida. Não promove fixtures e não usa essa preparação para ações Master.

O critério 4.3 só pode ser encerrado após a execução publicada e a revogação dos
quarenta links históricos, com bytes/cotas preservados e recibos autenticados.
Rollback do código nunca deve recolocar objetos nos endereços aposentados.

A verificação pública de publicação é um GET sem banco nem execução de
trabalho. O POST continua exigindo a capacidade privada. Em 26/10, a revisão
automática recusou até um POST vazio de verificação por considerar possível
iniciar alterações reais; a execução dos quarenta endereços históricos depende
de autorização específica do titular. O GET e os arquivos descartáveis são
validados separadamente. Nenhum arquivo histórico foi movido por essa tentativa.

Imagens que falharem após uma assinatura antiga recebem uma retentativa
limitada, com invalidação somente daquela referência e conta. Uma resposta
anterior que chegar tarde não volta ao cache. Isso evita esperar o prazo normal
da assinatura para resolver o endereço novo. A operação não renova as 72h nem
apaga o espelho instalado de imagens.
