# Progresso dos aceites finais para vendas

Baseline de 04/10/2026, 23h06 de Manaus. A porcentagem mede itens com aceite
integral registrado, não linhas de código nem estimativa de esforço. O plano
tem 23 itens, derivados das sete etapas apresentadas ao responsável.

**Aceites integrais: 0/23 — 0%. Etapas inteiramente encerradas: 0/7.**
Existe implementação e evidência parcial, descrita no RELEASE-PLAN.md; não
reiniciamos o trabalho. Cada aceite novo deve referenciar prova, revisão e data.

| Item | Resultado exigido | Status atual |
| --- | --- | --- |
| 1.1 | Dois dead letters reconciliados individualmente com o Asaas | Pendente: erro identificado; sem conferência no provedor |
| 1.2 | Duplicatas e eventos fora de ordem | Parcial: código/ensaios; prova real pendente |
| 1.3 | Webhook perdido recuperado | Parcial: reconciliação implementada |
| 2.1 | Estados do ciclo financeiro | Parcial: ensaios; provedor pendente |
| 2.2 | Dados e período pago preservados | Parcial: regras/testes; aceite do fluxo pendente |
| 2.3 | Acesso nas plataformas e janela offline de 72 horas | Parcial: código, CI/restore, instalador Windows e limpeza offline nos emuladores Android; recuperação API 37/distribuição/aparelhos/iOS pendentes |
| 3.1 | Upload/exclusão de casos, pacientes, fotos e avatar | Parcial: caso Web confirmado; demais fluxos pendentes |
| 3.2 | Concorrência, falhas e reservas históricas | Parcial: ensaios; revisão histórica pendente |
| 3.3 | Armazenamento nas plataformas disponíveis | Pendente de aparelhos |
| 4.1 | Cadastro, confirmação e recuperação de senha | Parcial: Auth/fixtures; recuperação pendente |
| 4.2 | Sessões, MFA, isolamento e replay financeiro | Parcial: fixtures/testes; replay real pendente |
| 4.3 | Arquivos privados e validade dos links | Em aberto |
| 5.1 | Histórico e documentos de cobrança | Parcial: código/ensaios; fluxo pendente |
| 5.2 | Solicitações executadas no Asaas | Em aberto: ainda são solicitações |
| 5.3 | Downgrade, falhas e execução única | Parcial: requisitos/transporte; executor pendente |
| 6.1 | Processador regular e alertas comprovados | Parcial: cron/telemetria; atraso detectado |
| 6.2 | Backup, restauração e incidente | Parcial: restore limpo; recuperação operacional pendente |
| 6.3 | Onboarding, plataformas e capacidade piloto | Em aberto |
| 6.4 | Documentos comerciais e privacidade revisados | Protocolo preparado; minutas/revisão pendentes |
| 7.1 | Conta recebedora aprovada | A confirmar pelo responsável no Asaas |
| 7.2 | Secrets, webhook e agendamento de Produção | Agendador preparado; configuração pendente |
| 7.3 | Recebimento, ledger e acesso reais comprovados | Em aberto; responsável fará compra de R$1 quando liberada |
| 7.4 | Decisão de liberação para vendas | Pendente dos demais aceites |

Um item aprovado vale 100/23 pontos percentuais. Etapas são encerradas somente
quando todos os seus itens e riscos aplicáveis têm decisão registrada. Mudanças
de escopo exigem atualizar denominador e explicar a mudança; não arredondar
uma prova parcial para concluída nem incluir teste fictício como pagamento real.
