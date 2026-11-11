# DentalFlow — tarefas do beta enquanto a hospedagem não está disponível

**Situação em 11/11/2026 — plano simplificado, SEM lançamento autorizado.**
Fonte do progresso oficial: [controle das 8 etapas](./BETA-RELEASE-8-EXECUTIONS.json).
Fonte dos bloqueios de lançamento pago: [8 verificações obrigatórias](./PAID-BETA-READINESS.json).
A conferência automática segura é \`node scripts/saas-beta-offline-handoff.mjs\` (somente leitura).

## Ponto atual: 4/8 (50%)

| Etapa | Em palavras simples | Estado oficial | O que ainda pode ser feito sem Lovable |
|---|---|---|---|
| 1. Código | Conferir se temos a fonte correta e uma base que compila | Concluída | Repetir CI apenas quando houver mudança |
| 2. Arquivos | Verificar o pacote histórico recuperado | Concluída | Guardar a cópia cifrada privada |
| 3. Restaurar | Abrir uma amostra relevante de arquivos com o banco isolado | Concluída no escopo aprovado | Não refazer integralmente testes sem necessidade |
| 4. Casos e segurança | Abrir/editar casos e impedir uma clínica de acessar outra | Concluída em QA local | Validar novamente apenas após mudança relevante |
| 5. Asaas | Receber e reconciliar mensalidades sem ativar/desativar acesso errado | Pendente | Testes locais, negativos e documentação do ciclo |
| 6. LGPD e convites | Mostrar termos corretos, proteger novos cadastros e privacidade | Pendente | Minutas, testes no banco isolado, regras de aceitação e parada de novas vendas |
| 7. Publicar com reversão | Provar qual versão está no ar e como voltar atrás | Pendente | Teste local de builds Web A→B→A, SHA e ensaios sem servidor real |
| 8. Beta por convite | Convidar a primeira turma paga com suporte, segurança e rollback | Pendente | Checklist de aceites, plano de atendimento e registro de decisão do dono |

**O progresso só aumenta após evidência suficiente.** As etapas podem ser concluídas fora da ordem; a publicação final NÃO pode acontecer antes de todas. O número 4/8 é diferente dos 23 aceites formais históricos.

## Trabalho em branches, sem modificar o serviço atual

- [PR #290](https://github.com/GustavoFboz/dtfipo/pull/290) — convites empresariais no servidor, bloqueio de novas compras, recibos da versão dos Termos SaaS/DPA. **Draft, flags desligadas, não implantada**. Testes PostgreSQL e Vitest não equivalem a ambiente real.
- [PR #291](https://github.com/GustavoFboz/dtfipo/pull/291) — duas chamadas de leitura para examinar a primeira/segunda mensalidade no Asaas **Sandbox**, com código sintético já testado. **Draft; nenhuma consulta real ao provedor demonstrada**.
- Ensaios já criados para a etapa 7: teste de reversão Web A→B→A servindo arquivos HTTP no localhost. **Não testa autenticação, banco, SSR, webhook nem rollback em hospedagem real.**
- Este protocolo: exibe pendências reais e impede que documentação de teste, URLs fictícias ou uma porcentagem técnica sejam apresentados como autorização comercial.

## Quando a hospedagem voltar (a partir do dia 24, se esse for o acesso informado pelo responsável)

**Sem criar novos planos ou compras no Asaas de Produção.**

1. Dar acesso a um **ambiente de QA de verdade, separado da produção**. O responsável pode apenas confirmar que o ambiente voltou e indicar o projeto; credenciais e tokens ficam nos cofres de segredo da plataforma. Não copiar dados clínicos identificáveis para QA.
2. Revalidar uma amostra da cópia de banco/Storage, login, abertura de casos, anexos, visualizador STL, mensagens em tempo real e segurança entre duas empresas fictícias.
3. **Somente no Sandbox do Asaas** verificar pagamento da segunda cobrança, evento autêntico recebido, reconciliado uma vez no worker e status de acesso adequado. Cobrir atraso, cancelamento e regularização sem mexer em clientes reais.
4. Solicitar aprovação do proprietário para **preços comerciais, limites e suporte** e encaminhar minutas a advogado e consultoria de privacidade/contador, conforme necessário. Documentos finais, fornecedores e retenção devem refletir a infraestrutura de fato escolhida.
5. Executar staging completo e rollback real no **mesmo host** (SSR, API, Auth, DB, Storage); conferir revisão Git/versão exposta e as dependências. Só então avaliar merge/deploy e publicação final.
6. Registrar provas de cada um dos **8 controles P0** e solicitar **autorização explícita para a primeira turma paga por convite**. Publicar somente se todos estiverem realmente verificados.

## Não fazer antes da liberação

- Não alterar domínio ou DNS, webhooks de Produção Asaas, segredos, cron, RLS, banco ou Storage Live.
- Não fundir automaticamente as PRs de beta na branch de Produção; a ordem de migrações, testes e rollback deve ser revisada.
- Não publicar Termos SaaS/DPA ainda em minuta nem declarar aceite de clientes automaticamente.
- Não criar assinaturas duplicadas nem cancelar assinaturas da empresa existente para "testar".
- Não publicar informações clínicas, CPFs, senhas, chaves, URL assinada ou backup decifrado no GitHub público.
- Não usar um ensaio local como prova de desempenho para 10 mil usuários simultâneos.

## Coisas que dependem de decisão do proprietário (mais tarde)

- Confirmar preço/armazenamento de cada plano e as condições de beta.
- Escolher e confirmar os fornecedores e a hospedagem/armazenamento definitivos, com contratos apropriados para dados de saúde.
- Validar a identificação legal do prestador em canal seguro e aprovar condições e contatos reais de suporte, com revisão adequada.
- Aprovar o teste financeiro controlado exclusivamente Sandbox e indicar quando o ambiente de QA estiver operacional.
- Autorizar expressamente a publicação do beta pago **depois** das evidências técnicas/jurídicas.

**O usuário não precisa refazer downloads históricos ou intervir em cada teste de código.** Dados financeiros/pessoais devem ser tratados somente nas interfaces oficiais, nunca no chat ou GitHub público.

## Critério de honestidade

Os três tipos de resultado são diferentes:
- **Código preparado:** branch/PR/revisão, ainda não implantado.
- **Teste sintético aprovado:** fluxo e casos de erro com dados falsos, ainda não validado em Asaas/hosting de verdade.
- **Aceite real verificado:** evidência do provedor e ambiente de QA com responsável, versão e logs sanitizados. Somente isso pode fechar os estágios hospedados.

Nenhum documento deste diretório, teste CI ou script automatizado autoriza cobrança, publicação, acesso clínico ou cancelamento.
