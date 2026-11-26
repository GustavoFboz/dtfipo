# Webhook de Produção ativado — 18/10/2026

Às 16h45 de Manaus, o titular informou ter ativado o webhook existente no
próprio navegador. A consulta privada ao Asaas às 20h47 UTC confirmou
a alteração. Não depende de compartilhar a sessão do navegador do titular.

## Conferência real

- Webhook único `ee2af07c-ec23-4224-893b-390efbc85c8f`, com enabled=true.
- Fila não interrompida, API 3, envio sequencial e os 13 eventos esperados.
- Nenhum evento obrigatório ausente ou desconhecido.
- Conta com aprovação geral APPROVED; dados bancários PENDING separados.
- Backend em production, production_enabled=true.
- Cron Production ativo, última resposta HTTP 200 sem timeout às 20h46 UTC.
- Processador status ok, contadores de falha e revisão zerados.
- Plano Inicial: BRL 100 centavos/mês.
- Na leitura de 20h47, nenhum evento ou pagamento de Produção no banco.

O token é ocultado pelo Asaas após a criação. A leitura deixa
token_verification=requires_delivery; enabled=true não comprova autenticação
na entrega nem recebimento financeiro. Nenhuma credencial foi regenerada.

## Interpretação do diagnóstico

Foi reexecutado somente o job privado de leitura, pela integração GitHub:
[execução, tentativa 2](https://github.com/GustavoFboz/dtfipo/actions/runs/39160671286/attempts/2),
job 117785699445. Ele usa as credenciais existentes, sem expô-las ao agente,
sem chamar o worker financeiro ou criar recursos no Asaas.

A consulta cadastral passou e a leitura do webhook retornou HTTP 200.
O job agregado terminou em failure porque sua validação de preparação ainda
exige enabled=false. Após a ativação solicitada, essa condição deixou de
representar o estado desejado. Não é uma recusa da API ou falha do webhook.
A revisão conferiu diretamente os campos sanitizados: ativo, único, fila
normal, API/envio/eventos corretos e nenhum token com mismatch.
O artefato 12149864427 registra a resposta, com SHA-256
`850d6cc7b1f3c22a6e18e979c54c56367009823ab4f7c2d2b222f145d9502c7f`.
Não desativar o webhook apenas para tornar verde o teste legado de preparação.
[Recibo sanitizado](production-webhook-activation-20261018.json).

## Teste real de R$1

O titular deve usar uma empresa comum elegível. IPO mantém sua isenção.
Na tela de assinatura, selecionar Inicial por R$1/mês, escolher o ambiente,
salvar os dados reais de cobrança no próprio sistema e usar
**Continuar para o pagamento**. A página deve apresentar **Produção** e
**Abrir pagamento seguro do Asaas**. O pagamento é concluído pelo titular.

Após criação/recebimento, conferir eventos autenticados, valor, liquidação no
provedor, ledger e acesso. Abrir a página ou criar uma cobrança não comprova
pagamento. Não usar dados fictícios, conversão de IDs Sandbox, cancelamento,
estorno ou replay para simular o resultado.

**5/23 aceites integrais (21,74%), 0/7 etapas encerradas.**
O item 7.2 permanece parcial até as provas aplicáveis de entrega/monitoramento;
7.3 continua pendente do recebimento real. Código e versões nativas não foram
alterados neste checkpoint. O acesso à conta pelo navegador na nuvem deixou
de ser necessário para esta ativação, realizada e confirmada por outros meios.
