# DentalFlow SaaS 7.4 — bloqueio de liberação comercial (01/11/2026)

## Decisão atual

**A LIBERAÇÃO COMERCIAL GERAL NÃO ESTÁ AUTORIZADA NO PROTOCOLO.** A plataforma tem **13 critérios integralmente homologados de 23**, com **10 critérios ainda abertos** (2.1, 2.2, 2.3, 3.3, 4.2, 5.3, 6.2, 6.3, 6.4, 7.4). O painel acompanha uma **única porcentagem de implementação**, sem transformá-la em autorização para vender. Este é um bloqueio de governança e **não desativa nem altera os fluxos de checkout/assinatura já existentes em Produção**.

O novo `scripts/saas-sales-release-gate.mjs` lê o ledger canônico, valida a assinatura dos 23 IDs e emite somente projeção agregada de status. Com pendências retorna `status=blocked` e `release_authorized=false`. Se e somente se houver 23/23 aceites, retorna `eligible_for_manual_release_review` **com `release_authorized=false`**: a decisão final é do responsável após auditoria, jamais de um script, CI ou inteligência artificial.

A interface Master avisa que a liberação comercial não está autorizada, sem uma segunda porcentagem. Testes garantem bloqueio em 72,72%, impedem falsificação de critérios ou promoção por gates parciais, e conferem que 100% ainda precisa de revisão manual.

## O que não foi feito

Não foi habilitada flag de venda, não houve compra ou webhook, reprocessamento financeiro, geração de termo comercial, envio de contrato, migração de esquema, exclusão de arquivos nem rollout de APK/Windows. A prova é de **controle preventivo**, não de abertura de comercialização.

## Pendências de liberação

Validar ciclos de inadimplência/estorno/reativação com provas do Asaas; concluir backup 708/708 e restore do estado atual; completar sessões reais multiempresa; testar Android/Windows físicos; ensaio piloto com carga controlada em staging; revisar juridicamente termos, DPA e retenção; obter decisão final explícita e versionada do responsável após verificar o commit da publicação. **Não antecipar a vigência de 18/12/2026** para forçar um aceite.

Este controle representa preparo de governança do 7.4, **não** sua conclusão integral.
