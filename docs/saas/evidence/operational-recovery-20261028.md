# Recuperação operacional — prova e limites de 28/10/2026

A rotina criptografada foi implementada e o ensaio real em infraestrutura
descartável passou. **6.2 continua parcial; 13/23 (56,52%)**, 1/7 etapas
encerradas. Nenhuma vigência de assinatura foi encurtada para este resultado.

## Resultado executado

[Run 40808635407](https://github.com/GustavoFboz/dtfipo/actions/runs/40808635407),
job 123233450181, concluído em 29/10 às 02h50m45s UTC (**28/10, 22h50 Manaus**).
Head da PR: `0dc04f55b3056929a7d15ae79e7bccc11cfec1aa`.
Merge temporário testado pelo GitHub: `b39ffb3939b1ccfd5b9b4a3bfed0843c7fe50de3`.

| Medida | Resultado |
| --- | --- |
| Verificações operacionais | 16/16 aprovadas |
| Registros recuperados | 269, em 158 tabelas dos bancos descartáveis |
| Arquivos recuperados | 3; 2.097.208 bytes; UTF-8, binário >2 MiB e vazio |
| Integridade | Contagens, SHA-256 por tabela/arquivo e 268 chaves estrangeiras |
| Falhas provocadas | Referência de paciente inválida após inserts; encerramento real da conexão |
| Recuperação após as falhas | Banco revertido, sequências preservadas, arquivos preparados removidos; nova recuperação íntegra |
| Histórico financeiro | Dois pagamentos, 45.400 centavos, contrato atual preservado |
| Preço futuro | Growth 44.900 atual; Inicial 500 programado, sem ativação antecipada |
| Criptografia | AES-256-GCM; entradas autenticadas; corrupção recusada |
| Duração medida | 7.214 ms; somente este conjunto pequeno, não estimativa de Produção |

Chaves, pacotes de backup e payloads de dados ficaram temporários e privados.
O CI publica apenas recibo e fases fixas. Os registros do ensaio são fictícios;
os arquivos e os dois bancos PostgreSQL são reais e descartáveis. A inserção
SQL dos contratos não é prova de Auth, MFA ou pagamento/execução Asaas real.
O destino é PostgreSQL isolado + cofre de arquivos offline, sem Auth/Storage
servindo tráfego e sem processadores financeiros ativados.

## Validações de código

CI Web [40808635360](https://github.com/GustavoFboz/dtfipo/actions/runs/40808635360)
e restore de 186 migrations
[40808635457](https://github.com/GustavoFboz/dtfipo/actions/runs/40808635457)
aprovados. Localmente: sete testes de arquivo/transporte/destino, 442 testes
financeiros/Desktop em 20 arquivos, tipos, gates 06/09 e bootstrap Desktop.
Não houve nova versão nativa publicada nem aceite de aparelhos.

O preparo do CI remove dados de exemplo e agendamentos das migrations apenas
nos dois containers novos e descartáveis. Mantém `postgres` para os workers
internos e cria outro banco com nome de recuperação. A transação de recuperação
usa conexão reservada e bloqueia continuação/reconexão após perda da sessão;
o teste termina o backend de verdade antes de uma validação e comprova rollback.

## Origem preservada

Leitura de **29/10, 02h46m52s UTC = 28/10, 22h46 Manaus**: 701 arquivos ready,
8.374.117.446 bytes, zero reservas, 23 conexões e nenhuma espera por lock.
A continua cancelada com período pago até 18/12 UTC; B continua Growth ativa
com o mesmo período. Há uma auditoria de cancelamento e uma de plano. O termo
Inicial/500 de B continua scheduled para 18/12 UTC. Não houve nova chamada
Asaas, SQL de escrita no Cloud, mudança financeira ou restauração sobre a origem.
Essas contagens não são teste de capacidade nem substituem o aceite dos dados.

## Limite operacional e próximo passo

O painel mostrou 14 backups diários do banco, o mais recente em 28/10 às
13h03m59s UTC. A tela de backups oferece restauração sobre o mesmo projeto.
Nas configurações há Export data; a tentativa de abrir o diálogo excedeu o
prazo e o navegador ficou indisponível. Não foram observadas as confirmações
Export/Start export nem um download novo. A consulta de metadados encontrou
somente uma exportação antiga, de 05/09 UTC, com 773.383 bytes. Não usá-la como
cópia desta revisão. O ambiente de execução também ficou indisponível ao final.

A [documentação oficial](https://docs.lovable.dev/features/database-backups)
explica que a exportação contém estrutura/dados/contas e hashes de senha, mas
os arquivos e configurações/segredos são separados. O caminho real é exportar
a revisão atual, copiar os arquivos com consistência, preparar o destino
compatível e verificar dados, referências, acesso e retomada. Nunca restaurar
sobre Produção para demonstrar esse aceite e nunca iniciar cobranças na cópia.

Encerrar 6.2 depende dessa prova operacional do ambiente autorizado. Ao passar,
o contador poderá ir a 14/23 (60,87%), sem esperar pelo período de B. O relógio
financeiro e o aceite 5.3 permanecem independentes.

[Recibo sanitizado](operational-recovery-20261028.json) ·
[Rotina e operação](../OPERATIONAL-RECOVERY.md).
