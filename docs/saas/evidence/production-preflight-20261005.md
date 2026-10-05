# Evidência real de credenciais e aprovação geral — 05/10/2026

## Prova preservada

Consulta privada em 2026-10-05T17:49:20.488Z (13h49 de Manaus).
Execução: https://github.com/GustavoFboz/dtfipo/actions/runs/37350659436
Job da tentativa: 111902432611. Artefato: 11362591750,
saas-production-preflight-37350659436, SHA-256 do ZIP
3942d5440e02aceb084194a11a32e7c046fc113d4f53af948bea2847acd186f9.

O JSON original sanitizado está em
[production-account-status-20261005.json](production-account-status-20261005.json).
O artefato anterior da mesma execução (11362287491) pertence a outra tentativa
e não comprova o resultado mais recente.

## Revisão e aceite 7.1

configuration_valid=true comprova o carregamento do grupo exclusivo de
Produção (API key, webhook token, worker token e replay token), incluindo
User-Agent válido. A consulta autenticada pelo GitHub comprova que seu token
de worker corresponde ao do backend. credentials_valid=true comprova que
a chave real foi aceita pelo GET de situação cadastral do Asaas.

Resultado: general, commercialInfo e documentation APPROVED;
bankAccountInfo PENDING. A documentação oficial distingue os quatro estados:
general=APPROVED indica aprovação cadastral geral concluída; bankAccountInfo
PENDING indica dados bancários ainda não enviados.

O contrato v1 preservado neste arquivo calculava account_approved como
aprovação dos quatro campos. Seu false representa cadastro não integral,
não ausência de aprovação geral. O contrato v2 corrige a distinção e acrescenta
account_setup_complete. Não modificar a prova original para mudar esse booleano.

Decisão técnica: critério 7.1 comprovado pela resposta real do provedor e sua
interpretação oficial; 1/23 (4,35%) de critérios finais. A pendência bancária
continua visível para revisão pelo titular. Não há decisão de vendas neste aceite.

## Limites

runtime_environment=sandbox, production_enabled=false,
webhook_delivery_verified=false, financial_processing_invoked=false.
A consulta não comprova entrega de webhook, execução do agendador de Produção,
liquidação, ledger, acesso do cliente nem ciclo financeiro. O item 7.2 continua
parcial, 7.3 e 7.4 abertos. Não foi criada cobrança, executado replay ou alterada
a conta recebedora. Não atribuir a falha de conexão anterior a uma causa que
não foi comprovada pelos metadados disponíveis.

Fonte: https://docs.asaas.com/reference/consultar-situacao-cadastral-da-conta

## Conferência publicada — 14h13 de Manaus

PR 133: https://github.com/GustavoFboz/dtfipo/pull/133
Merge SaaS: 61bde8b54de57237a440002c45be81cff3edbc11.
Candidato d40f9f89237cdbf4613f8110dbd2f132d172de1d passou CI 37353827676
e restaurações 37353827765/37353833808. Verificação local: 202 testes em
12 arquivos, TypeScript, etapas 06/09, bootstrap Desktop e contrato Bash
com HTTP fictício. Publicação solicitada após sincronização do commit;
as respostas reais abaixo confirmam os novos contratos publicados.

Execução: https://github.com/GustavoFboz/dtfipo/actions/runs/37354065989
Job da tentativa publicada: 111912836778. Artefato 11364400542,
SHA-256 do ZIP 59e34e427748621db76ebf5baab994284263056652e71947471bf386321447a5.
Não usar o artefato anterior 11363856689, anterior à publicação.

- [Conta v2](production-account-status-v2-20261005.json),
  2026-10-05T18:13:45.653Z: account_approved=true,
  account_setup_complete=false; estados cadastrais confirmados sem mudança.
- [Webhook](production-webhook-status-20261005.json),
  2026-10-05T18:13:46.185Z: listagem completa, um registro no endereço esperado,
  id ee2af07c-ec23-4224-893b-390efbc85c8f. API v3, envio sequencial,
  interrupted=false e todos os 13 eventos esperados; nenhum evento desconhecido.
- enabled=true, apesar de o backend financeiro permanecer em Sandbox.
  webhook_prepared=false é um achado válido de configuração, não falha da
  consulta ou da chave API. A revisão requer desativar este webhook dedicado
  durante a preparação; nenhuma alteração foi feita pelo diagnóstico.
- token_matches=null: o campo de token não foi fornecido em formato comparável
  pela listagem. Não equivale a divergência de token. Sua correspondência e
  entrega permanecem sem comprovação; não gerar novos tokens por causa disso.

Próxima ação do titular: Asaas → Integrações → Webhooks → DentalFlow Produção
(conferir o ID acima) → Editar → Ativado=false/desativado → Salvar.
Preservar endereço, token e eventos. Informar apenas que foi desativado.
Se o nome for diferente, localizar pelo ID; não alterar outros webhooks.

## Pendência do agendamento

Consulta apenas de leitura ao banco confirmou último heartbeat Sandbox em
2026-10-05T09:15:25.38289Z (05h15 de Manaus), status ok. Nenhum heartbeat
de Produção. A execução agendada do worker 37288816440 foi bem-sucedida,
mas não há comprovação de regularidade recente a cada cinco minutos.
O probe 37354066005 confirmou contrato publicado/acesso ao banco e falhou
no critério de execução recente; não era perda de conexão no diagnóstico.
Listagem de execuções agendadas evidencia intervalos extensos; não identifica
a causa de ausência de disparos. Não encerrar 6.1 ou o agendamento de 7.2
com uma execução manual isolada. Não reenviar dead letters como diagnóstico.

Decisão: 7.1 continua concluído; 7.2 permanece parcial. Não habilitar vendas
ou afirmar recebimento/entrega como comprovados com essas consultas.

## Ajuste do titular confirmado — 14h36 de Manaus

O titular informou "salvo" às 14h35 de Manaus. A nova consulta real foi
registrada no job 111922468640 da execução 37354065989.
Artefato 11365181776, criado em 2026-10-05T18:36:23Z,
SHA-256 do ZIP 633f47618d2964bcea1f45cac8b4714e50fe0bd8d45f3979f11f440942c5fb5e.
Resposta original preservada em
[production-webhook-disabled-20261005.json](production-webhook-disabled-20261005.json).

enabled=false, interrupted=false, um único webhook, endereço correto,
API v3, envio sequencial e todos os 13 eventos confirmados. Token continua
omitido. A documentação oficial informa que seu valor é retornado apenas na
criação, tornando inadequado exigir que uma listagem normal o devolva.

O contrato webhook-v2 separa webhook_configuration_valid de token_verification.
Omissão normal indica requires_delivery; divergência efetivamente comparável
indica mismatch e continua recusada. O workflow não falha por omissão normal,
mas mantém autenticação, entrega e aceites financeiros pendentes. Nenhum token
novo foi gerado, webhook criado ou evento enviado para obter esta prova.

Fonte: https://docs.asaas.com/docs/criar-novo-webhook-pela-api

Execução agendada Sandbox 37356822791, criada em 18h33 UTC, foi bem-sucedida;
heartbeat confirmado em 2026-10-05T18:33:30.124305Z. Isso comprova retomada
recente, sem encerrar a regularidade após os intervalos anteriores. A consulta
de capacidades mostrou pg_cron/pg_net disponíveis e pré-carregados no backend,
porém ainda não instalados; nenhum agendamento de banco foi criado nesta prova.
