# Rodada de conclusão — 3/7 e 4/7

04/10/2026, Manaus. Base remota conectada:
c90a6aa0cdbb043ab080385516347e64f80b7fda, árvore
066f98d8d82ef5b9fe4ebb5ca1032a340d107e63.
Plano único de conclusão: RELEASE-PLAN.md; 7/7 etapas ainda têm aceites.

## Alterações

- Nova senha usa o mesmo mínimo de oito caracteres no cadastro, recuperação,
  adapter legado e handlers da equipe. Credenciais não são normalizadas.
  A regra de criação não impede login de contas antigas com senha menor.
- Recuperação volta a habilitar o botão após erro de rede e só anuncia sucesso
  após confirmação do Auth.
- Cadastro consulta preço/limites atuais do catálogo; não exibe os antigos
  R$249 enquanto o backend informa R$1 nem inventa preço quando a leitura falha.
  Não altera planos ou snapshots de contratos.
- Exclusão de anexo de paciente conserva registro, cache e cota exibida se
  Storage ou banco recusarem a operação. URL assinada ausente não conclui upload.
- Cancelamento de reserva não subtrai bytes antes de confirmação/medição do
  servidor e não faz dupla subtração numa retentativa idempotente.
- Administração de equipe sem empresa é recusada antes de consultas privadas;
  troca de senha exige o mesmo vínculo de empresa do alvo. E-mail já existente
  não dispara busca global, redefinição de senha ou transferência da identidade.
- Handlers privados foram separados do transporte autenticado TanStack,
  mantendo os nomes públicos e o middleware de autenticação nas três funções.
  Testes executam a lógica dos handlers com dependências falsas, sem alterar
  senhas/identidades reais.

## Validação

243 testes em 21 arquivos passaram: 209 anteriores e 34 novos.
TypeScript e checks 06/08/09, workflows com HTTP falso, bootstrap Desktop,
contrato Android e restore guard de 167 migrations passaram.
Não houve migration nova ou modificação de schema neste incremento.

No backend ativo, os três scripts somente leitura passaram:
stage-06-quota-assertions.sql, stage-06-upload-assertions.sql e
stage-06-reservation-recovery-assertions.sql.
O ensaio novo de foto/anexo de paciente testa reserva de 40+60 bytes num
limite de 100, recusa de um byte adicional, outra empresa, tamanho adulterado,
cancelamento com objeto presente e liberação exata após limpeza. Ele roda
somente no banco descartável do CI; metadata SQL sintética não é upload HTTP.
CI, compilações finais e recibos de integração/publicação são registrados na PR.

## Limites explícitos

- O conector não fornece a política global do Supabase Auth. A aplicação pode
  exigir oito caracteres sem que uma chamada direta ao Auth faça o mesmo.
  Configuração e prova negativa com conta isolada continuam sendo aceite de 4/7.
  Referências: https://docs.lovable.dev/features/email-auth e
  https://supabase.com/docs/guides/auth/password-security.
- Ainda faltam uploads reais de paciente/foto/avatar nas plataformas, falhas
  HTTP, sessões reais, revisão de reservas/objetos históricos e a revisão
  abrangente de segurança indicada no plano. Não declarar 3/7 ou 4/7 completas.
- SELECT às 13h35 de Manaus: Inicial 100 centavos, zero pagamentos de Produção;
  heartbeat Sandbox ok às 09h29:31, sem erros/revisões. Esse registro antigo
  não comprova regularidade do agendador.
- Pausa financeira, teste real adiado, DICOM fora desta rodada e cortesia IPO
  permanecem. Nenhum POST financeiro manual ou alteração de flag de Produção.

Rollback do código restaura a revisão validada anterior sem tocar no banco,
mas reabre os caminhos de falha descritos acima; preferir correção progressiva.
Manter o snapshot de preço das assinaturas, as filas e os dados clínicos.
