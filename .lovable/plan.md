# Corrigir acesso vitalício e seleção múltipla de dentes

## Alterações
- Invalidar o cache antigo de assinatura no aplicativo Windows e preservar explicitamente o acesso interno vitalício validado pelo servidor, sem inventar permissões offline.
- Manter o mesmo contrato de assinatura na Web e no Windows, com uma regressão para impedir que a IPO seja rebaixada por período local inválido.
- Fazer os parâmetros do menu de trabalho atuarem sobre todos os dentes rosados selecionados.
- Tratar parâmetros em lote como aditivos quando a seleção é mista e subtrativos quando todos já possuem o mesmo parâmetro.
- Trocar o título abreviado atual por intervalos na ordem do odontograma, como `11 → 14, 24 → 26, 31, 41`, e mostrar a lista completa ao passar o cursor.
- Adicionar testes para intervalos, ordem odontológica e edição em lote.

## Validação
- Executar os testes direcionados da seleção dentária e da assinatura Desktop.
- Verificar tipos e a compilação da prévia.
- Confirmar visualmente o menu de trabalho em tela.

## Limites
- O acesso vitalício continuará vindo da validação do banco; o aplicativo não concederá esse acesso por suposição local.
