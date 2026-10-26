# Rotação dos endereços privados antigos

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

A validação cobre o SQL em banco descartável com rollback, o adapter e a ordem
de efeitos sob falhas. O job privado de Storage usa sessões USER reais e gira
somente seu avatar descartável, incluindo assinatura curta, vencimento,
renovação, recusa estrangeira e tentativa de reutilizar o caminho com reserva
válida. Não promove fixtures e não usa essa preparação para ações Master.

O critério 4.3 só pode ser encerrado após a execução publicada e a revogação dos
quarenta links históricos, com bytes/cotas preservados e recibos autenticados.
Rollback do código nunca deve recolocar objetos nos endereços aposentados.
