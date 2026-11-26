# Checkpoint das fixtures e incidente Cloud — 08/10/2026

**Resultado: 2/23 aceites (8,70%); 21 abertos/parciais. Nenhum aceite integral
novo. Os oito critérios adicionais da meta 10/23 continuam pendentes de prova.**
Horários deste registro são UTC. [Recibo estruturado](fixture-cloud-checkpoint-20261008.json).

## Implementação integrada e verificações

[PR154](https://github.com/GustavoFboz/dtfipo/pull/154) integrou 16 caminhos:
jobs restritos de identidade, cobrança e armazenamento, desativação de
notificações na criação de clientes Sandbox e limite empresarial para leitura
de avatares. Não fornece credenciais financeiras para administração de Auth.

- Candidato: `34a61dab12de167fba89f7a594505472afb9f017`.
- Merge: `da4c03ac3c48b182697a57dbd00e66cf83398d36`.
- CI do candidato: [37835744818](https://github.com/GustavoFboz/dtfipo/actions/runs/37835744818), aprovado.
- Restore do candidato: [37835752738](https://github.com/GustavoFboz/dtfipo/actions/runs/37835752738), aprovado.
- CI/restore após merge: 37836010196 e 37836010069, aprovados.
- 414 testes locais em 22 arquivos, TypeScript e build aprovados.
- Restore determinístico de 175 migrações.
- Lock Bun corrigido para a dependência Lovable 2.25.3 já declarada;
  instalação com lock congelado passou, sem reduzir a versão ou remover o gate.
- Migração `20261008194500_saas_avatar_company_boundary_stage06.sql`
  verificada no banco às 19:59:47.435156: política restritiva presente e
  execução por anon negada. As 38 referências assinadas antigas não foram
  revogadas e mantêm seu aceite separado.

A publicação retornou pending (pedido
`380485e9-c4de-44f9-a41c-758be5e81c39`). A sondagem somente leitura
[37836010223](https://github.com/GustavoFboz/dtfipo/actions/runs/37836010223)
falhou com seis respostas HTTP503. Isso não comprova qual HEAD está servido.

O diagnóstico Lovable também integrou uma correção de consulta do campo
inexistente crm_cro em GlobalSearch. O HEAD conectado passou a
`20fbe922b89b8a275c31d6649fac969d0076115e`, preservado neste checkpoint;
[CI 37837848114](https://github.com/GustavoFboz/dtfipo/actions/runs/37837848114)
passou. Essa correção não resolveu a conexão Auth→banco. O agente informou
cinco testes de busca aprovados e uma falha de ordenação; esse ensaio não
substitui os testes SaaS.

## Tentativa real de identidade

Job `a695ca0f-a519-43c5-b412-c1cebf10c717`, requisição 831,
enviado às 20:02:36.416435; retorno HTTP403, corpo seguro available=false.
Na leitura às 20:03:34.709286 permaneceu prepared, sem claim, conclusão ou
recibo; capacidade não consumida e zero usuários descartáveis encontrados.

A execução não chegou aos checks Auth. Esse 403 não identifica falha de
senha, MFA ou autorização de uma conta humana. O diagnóstico publicado
registrou POST às 20:04:25 sem detalhamento do motivo. A causa específica
permanece não comprovada. A credencial expirava às 20:12:36.416435; criar um
novo job depois da recuperação, sem reutilizar a credencial ou forçar claim.

Jobs de cobrança e armazenamento não foram enviados. Papéis empresariais e
acesso pago das duas fixtures também não foram alterados nesta rodada.
As contas fictícias anteriores, suas senhas e seus fatores MFA permanecem.

## Incidente confirmado no Cloud

Diagnóstico às 20:12, mensagem
`umsg_01m4ej80axf0r81fdhda59dbbw` pelo
[plugin Lovable no projeto](https://lovable.dev/projects/a8b717e3-87ad-482d-8d4a-de81679507e0):

| Observação | Evidência | Limite |
| --- | --- | --- |
| GET privado de saúde publicado | HTTP503 / HEALTH_READ_TIMEOUT às 19:59:33, 19:59:41, 19:59:50 e 19:59:58 | Leitura de billing_worker_health excedeu três segundos; nenhum erro específico de grant/schema exposto |
| Sondagem administrativa independente | backend_unreachable_db, Auth→banco HTTP503 | Confirma indisponibilidade da conexão; não identifica sua causa interna |
| SELECTs pelo conector | 504/UNAVAILABLE | Falha da consulta não equivale a tabela vazia |
| Métricas | Alerta histórico de DiskIO às 15:49:29, orçamento em 48% | Métricas atuais indisponíveis; não comprova quota esgotada nem causa raiz |
| Configuração local | URL corresponde ao projeto conectado; chaves administrativa/publicável presentes | Ambiente local somente; valores publicados e correspondência da chave não verificados |

O ajuste fundamentado é recuperar a disponibilidade do Lovable Cloud. Não
há evidência para trocar chaves, conceder permissões, alterar schema ou
aumentar timeout. O diagnóstico consumiu 1,5 crédito; junto da investigação
Auth anterior de 0,8, soma 2,3 dos cinco créditos autorizados nesta continuidade.
Esse número não informa o saldo geral da conta. Nenhuma mensagem ao suporte
foi enviada.

### Registro pronto para o suporte

Projeto DentalFlow: a8b717e3-87ad-482d-8d4a-de81679507e0.
Em 08/10/2026, diagnóstico às 20:12 UTC, a sondagem administrativa retorna
backend_unreachable_db com HTTP503 na conexão Auth→banco. Logs publicados
registram HEALTH_READ_TIMEOUT (limite de três segundos) às 19:59:33,
19:59:41, 19:59:50 e 19:59:58 UTC; consultas SQL retornam 504/UNAVAILABLE.
Solicitar verificação e recuperação do banco/Auth do projeto, preservando
dados e configuração. Não expor credenciais nem atribuir a causa ao alerta
histórico de DiskIO sem métricas atuais.

## Baseline preservado e retomada

Última leitura financeira bem-sucedida: 19:55:24.656926.
Dois eventos externos ainda em dead_letter, zero conclusões Master e zero
pagamentos de Produção. Não tratar esses pagamentos manuais de R$5 como
contratos SaaS. O registro de cadência Sandbox aceito em 05/10 é histórico;
a saúde atual precisa ser novamente verificada após o incidente.

1. Recuperar o Cloud e obter resposta válida da sondagem privada, além de
   leitura SQL e verificação do HEAD servido. Investigar o HTTP403 antes da
   nova execução; não presumir que a recuperação elimina esse erro.
2. No painel Cloud → Users → Auth Settings → Email settings, ajustar o
   mínimo global de senha para oito caracteres. A capacidade conectada não
   expõe password_min_length. Comprovar a política pelo Auth real.
3. Preparar novo job privado de identidade com prazo curto; conferir todos
   os checks e limpeza do usuário descartável, sem envio de e-mail.
4. Executar o job billing somente em Sandbox; conferir cliente sem
   notificações, assinatura/pagamento no provedor, ledger único, entrega
   idêntica, histórico e documento. Não inferir perda de webhook ou ciclo
   completo de cenários que não ocorreram.
5. Conferir o papel e acesso legítimos dos donos das duas empresas fictícias
   e executar storage pelas APIs reais; verificar os quatro buckets, quota,
   isolamento e limpeza dos próprios objetos. Preservar dados históricos.
6. O titular deve concluir individualmente os dois testes externos no Master,
   opção Revisar teste externo, com sua MFA real e conferência no Asaas.
   Motivo preparado: Cobrança manual de teste Sandbox de R$5, conferida no
   Asaas, sem vínculo com contrato ou checkout do DentalFlow.
7. Executar os cenários restantes de webhook perdido, ciclo financeiro
   completo e preservação de dados/período com provas específicas; atualizar
   o contador somente após cada aceite integral.

Produção, compra real de R$1 e liberação para vendas continuam condicionadas
ao protocolo. Contratos existentes, ledger, dados clínicos remotos, isenção
IPO e janela offline de 72 horas permanecem preservados.
