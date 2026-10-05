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
