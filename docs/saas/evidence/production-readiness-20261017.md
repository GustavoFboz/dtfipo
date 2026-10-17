# Preparação da migração para Asaas Produção — 17/10/2026

Solicitação do titular às 19h05 de Manaus: migrar para recebimentos reais e
realizar o teste do plano Inicial de R$1. O próprio titular concluirá o pagamento.

## Conferência real

Execução privada [39078122466](https://github.com/GustavoFboz/dtfipo/actions/runs/39078122466),
job `117529400987`, no commit `ea12e7e6ab8be861d051012c979d33a73da41bf6`.
Artefato `12117284647`, digest SHA-256
`e4b0d05a34181b177f25501f969cac267cebb263c0908e2df0c60aedaedbf0ec`,
conferido no ZIP baixado. Somente projeções sanitizadas foram preservadas.

- [Conta](production-readiness-20261017/production-preflight.json),
  23h12m41s UTC: credenciais válidas, aprovação geral, comercial e documentação
  `APPROVED`; dados bancários `PENDING`. Não confundir esta pendência específica
  com ausência de aprovação geral. Backend ainda em Sandbox, flag real desligada.
- [Webhook](production-readiness-20261017/production-webhook-preflight.json):
  um registro no endereço esperado, API v3, sequencial, desativado, sem
  interrupção e com todos os 13 eventos. Token omitido pelo Asaas no GET;
  comparação aguarda entrega real, sem regenerar a credencial existente.
- Banco: plano Inicial ativo, BRL, 100 centavos; quatro pagamentos Sandbox e
  nenhum de Produção. Cron Sandbox ativo com última resposta 200 e sem timeout;
  não há cron de Produção registrado.

## Preparação concreta do processador

O bootstrap existente seleciona agora o ambiente das mesmas variáveis já
usadas pelo fallback GitHub. Sandbox continua padrão. Produção exige
`BILLING_ENVIRONMENT=production` e `BILLING_PRODUCTION_ENABLED=true`, além de
o backend responder no mesmo ambiente com sua própria flag real habilitada.
Não pode registrar um ambiente diferente da resposta privada recebida.

O ensaio HTTP fictício cobre os dois ambientes, recusa antes de qualquer chamada
sem a flag de Produção, ambiente incorreto, contrato antigo, autenticação
recusada, dados privados em erros, isolamento ausente, configuração inválida,
preservação idempotente e renovação da cópia de token recusada. Também passaram os 340 testes de billing, os quatro testes de entitlement
Desktop, as verificações das etapas 06/09 e o bundle com 175 migrações.
No CI, a primeira renderização da LP excedeu a espera fixa de 200 ms do teste.
O teste agora aguarda a condição por até dois segundos, mantendo todas as
asserções de preço e plano, sem modificar o código da página.
Nenhum teste faz chamada real ao worker, ao banco ou ao Asaas.

## Próximos passos protegidos

O conector possui leitura do projeto e do banco, mas não edita os campos
protegidos. O painel privado do Lovable pediu login neste navegador. Após o
acesso seguro, alinhar as duas flags do backend, publicar, alinhar as duas
variáveis GitHub, registrar e conferir o cron de Produção e só então ativar o
webhook existente e disponibilizar o teste ao titular em uma empresa comum.
Não alterar IDs Sandbox, snapshots antigos, IPO, conta de cliente ou dados clínicos.

Este checkpoint não é uma ativação: nenhuma flag, webhook ou recurso financeiro
foi alterado. Não há aceite de pagamento real, entrega ou regularidade de
Produção. Contador preservado em **5/23 (21,74%), 0/7 etapas inteiras encerradas**.
