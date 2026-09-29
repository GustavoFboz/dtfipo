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


## Estado de conclusão técnica

A preparação executável do repositório está concluída quando o CI do candidato
passar com restauração limpa, ensaios 01–08 e o gate Stage 09. Isso **não**
equivale a declarar o SaaS financeiramente pronto: provas que exigem o provedor,
a conta publicada, credenciais de Produção, MFA ou pagamento real não podem ser
fabricadas por CI e permanecem bloqueadores externos.

### Checklist de handoff externo

- [ ] Autorizar nominalmente o operador Master e concluir MFA AAL2.
- [ ] Homologar upload comum e DICOM na conta publicada.
- [ ] Registrar no Sandbox duplicata, perda/reconciliação/replay e os estados
      financeiros reais ainda pendentes.
- [ ] Configurar credenciais e webhook exclusivos de Produção sem expor secrets.
- [ ] Autorizar e executar a compra controlada de R$ 1 somente após os itens
      anteriores; conferir webhook, ledger, entitlement, idempotência e
      cancelamento.
- [ ] Restaurar preço comercial antes de abrir o lote piloto.
