# Beta Web — ensaio de reversão do código isolado

**Objetivo:** antes de tentar substituir a versão publicada, comprovar que alterações recentes no código conectado ao Lovable podem ser revertidas sem manipular banco, Storage, Asaas, credenciais ou usuários.

O workflow `.github/workflows/saas-beta-source-rollback-rehearsal.yml` faz checkout completo em um runner descartável; aplica `git revert -m 1 --no-commit` nos merges auditados #244 (`00e692a`) e #243 (`2f34b2a`), recusa qualquer diff em migrations/rotas de cobrança, executa as proteções SaaS 06/09 e recompila a Web com Bun. O gate de vendas permanece bloqueado. Não faz push, não altera branch, não faz deploy ou pagamento.

**Critério estrito de evidência:** CI bem-sucedida prova somente *reversibilidade técnica do código-fonte destes dois merges* no ambiente isolado. Não prova que o Lovable reimplanta a versão anterior, que os novos contratos/as sessões são compatíveis, que o banco volta no tempo ou que existe backup completo dos 116 arquivos faltantes. Não considerar o marco 7.4 completo nem alterar 94,06% com esta entrega.

**Reversão real de uma publicação:** identificar commit servido e anterior, confirmar migrações/compatibilidade, backup atual íntegro, ensaio de rollback em cópia do ambiente, aprovação explícita para troca, mudança auditada em branch e publicação nova, teste de HTTP/Auth/casos/Asaas, telemetria, e interrupção de novas vendas se falhar. Não reverter contratos do Asaas ou desfazer pagamentos por voltar código.
