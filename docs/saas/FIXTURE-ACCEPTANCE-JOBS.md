# Validação real das duas identidades fictícias

A execução usa exclusivamente as duas fixtures mantidas por decisão do titular,
com IDs e e-mails exatos verificados no Auth, nas empresas e nos perfis. Nunca
cria um operador Master ou usa AAL2 fictício para encerrar eventos financeiros.

O backend técnico prepara um job privado com SHA-256 de credencial aleatória
dedicada, prazo máximo de quinze minutos e tipo fixo. O endpoint aceita apenas
o ID do job; não aceita seletor de usuário, empresa, senha, papel, link, URL ou
operação. A claim consome o hash atomicamente antes de qualquer chamada Auth.
Nenhuma credencial financeira pode provisionar ou autorizar esses jobs.

As tabelas não possuem acesso de anon, authenticated ou service_role. Apenas
as RPCs de claim/finalização possuem EXECUTE de service_role. O banco vazio
restaurado não contém jobs, credenciais nem identidades de usuários reais. O
self-heal preserva as restrições após seus grants genéricos.

O teste de identidade usa generateLink e verifyOtp no serviço Auth real. Não
chama signUp, resetPasswordForEmail, inviteUserByEmail ou envio de mensagens.
Cadastro, recusa antes da confirmação, consumo único de token, troca via
recuperação, login e revogação do refresh são conferidos no serviço publicado.
Uma identidade temporária, identificada pelo UUID do job em example.invalid,
é removida por API administrativa após revalidar seu marcador. As duas
identidades anteriores e suas empresas permanecem; suas senhas não são alteradas.

Senhas, links, hashes de recuperação, sessões e tokens só existem em memória
do servidor. A saída contém nomes de verificações, booleanos, códigos seguros,
status HTTP e IDs das fixtures. Falhas não são convertidas em aprovação.
Não registrar tokens nos comandos, relatórios, repositório ou respostas HTTP.

Uma execução concluída comprova somente seus checks reais. Publicar a rota,
passar regressões ou ensaiar SQL em banco descartável não encerra 4.1, 3.1,
5.1 nem qualquer critério financeiro. O titular continua responsável pela
revisão dos seus eventos manuais com sua sessão Master/AAL2.

## Execução de cobrança e arquivos — 08/10/2026

Os tipos privados `billing` e `storage` usam sessões reais das mesmas duas
fixtures, sem retorno de JWT. Cobrança exige configuração Sandbox e plano
company_growth de R$449 virtuais, conferidos contra o contrato do provedor;
não altera a oferta company_initial de R$1 do titular. Novos clientes Sandbox
são criados com notificações desabilitadas e essa opção é relida antes de
simular pagamento pelo endpoint oficial. Não existe simulação em Produção.
Timeouts de POST não são repetidos cegamente.

O checkout, os documentos e o worker passam pelos endpoints publicados. O
histórico usa a RPC do gestor com seu JWT real; a outra empresa deve ser
recusada. Redelivery usa duas requisições idênticas da projeção de um evento
real já entregue, sem inventar pagamento. Um aviso de atraso só comprova ordem
invertida se ainda estiver pendente depois de o provedor confirmar pagamento
e depois for processado com uma única linha do ledger. Falta de webhook só
comprova 1.3 se for observada e recuperada realmente; não é inferida de mocks.

Armazenamento cria registros e caminhos com UUID do job por APIs autenticadas,
reserva bytes, envia objetos de teste, vincula a origem, verifica download e
tamanho, recusa a outra empresa e remove os objetos pela Storage API antes
de liberar quota. Caso/paciente de cada execução são removidos. Não apaga
objetos históricos nem dados de uma empresa real. Os donos fictícios devem
ter o papel empresarial válido e acesso pago Sandbox antes desse teste;
nenhum papel Master é atribuído. Leituras de avatar intersectam as antigas
políticas com dono, empresa com acesso ou participação explícita em caso.
Links históricos já emitidos continuam com o tratamento separado de 4.3.

O primeiro job real de identidade (06/10, f944ed03-2e9d-433f-a354-26c826f842aa)
falhou porque o Auth aceitou sete caracteres e o ensaio tentou o login com a
credencial anterior. O teste agora restaura a credencial descartável para
verificar recuperação independentemente dessa falha de política. A ferramenta
Lovable consumiu 0,8 crédito e confirmou que não expõe password_min_length;
o ajuste global continua pendente no painel Auth, seguido de nova prova real.

Referências oficiais: [generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink)
e [verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp).
