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

Referências oficiais: [generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink)
e [verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp).
