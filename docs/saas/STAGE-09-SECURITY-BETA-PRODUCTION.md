# Etapa 09 — segurança, Beta e Produção

Status: preparação técnica iniciada. Produção permanece bloqueada e nenhuma cobrança real é autorizada por esta etapa.

## Gates obrigatórios

1. CI de restauração limpa e ensaios das etapas 01–08 devem passar no commit candidato.
2. As provas reais restantes do Sandbox (duplicata/perda/replay, ciclo de vida e upload/DICOM publicado) devem ser registradas sem mocks como evidência principal.
3. O operador Master deve ser explicitamente autorizado e usar MFA AAL2 antes de replay administrativo.
4. Sandbox e Produção devem usar chaves, webhook e dados separados. Segredos nunca entram no repositório.
5. `ASAAS_PRODUCTION_ENABLED` permanece falso até a compra controlada ser autorizada pelo operador.
6. A primeira cobrança de Produção será uma única compra controlada de R$ 1. Ela deve comprovar pagamento, webhook, ledger, entitlement, idempotência e cancelamento sem apagar dados.
7. Só depois desse aceite o catálogo volta ao preço comercial e o beta é liberado em lote piloto.

## Rollback

Desabilitar imediatamente a flag de Produção, manter ledger/eventos para auditoria e preservar dados/entitlements já pagos conforme o período contratado. Nunca apagar histórico financeiro como mecanismo de rollback.

## Observabilidade mínima

Antes do piloto: fila/dead-letter, falhas do worker, divergência Asaas↔ledger, falhas de checkout e uso/cota de armazenamento precisam de rotina operacional documentada. Alertas externos e credenciais de Produção dependem da configuração das contas e não são simulados no repositório.
