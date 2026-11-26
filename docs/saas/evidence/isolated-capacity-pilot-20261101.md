# DentalFlow SaaS 6.3 — piloto inicial de capacidade isolado

Data: 01/11/2026. **Ferramenta de preparo técnico; não é ensaio de capacidade do DentalFlow em Produção e não homologou 10.000 usuários.**

## Objetivo

A operação não deve sofrer carga adicional enquanto os aceites de backup/armazenamento e ciclo financeiro estão incompletos. Criamos um ensaio de HTTP local **estritamente limitado** para validar a infraestrutura de medição e os gatilhos de erro antes de considerar um piloto real.

- Destino permitido exclusivamente `http://127.0.0.1:<porta>/health` com porta explícita.
- Máximo **40 requisições totais**, **4 simultâneas**, 3 segundos por requisição; sem credenciais, cookies, dados de pacientes ou log de payload.
- Somente GET e nenhuma mutação financeira, SQL, Storage ou clínica.
- Relatório agregado: sucesso, erro, p50/p95 de latência, duração e simultaneidade; falha não conta como disponibilidade.
- Runner CI testa uma aplicação HTTP local descartável. A leitura de resultado NÃO confirma concorrência de banco, WebSocket/Realtimes, pagamentos, tamanho do Storage, nem operação de 10.000 usuários.

## Ordem para o piloto real, ainda pendente

1. Aprovar ambiente isolado, cópia **sem dados pessoais** e sem conexões Asaas ativas; definir identidade e auth de fixtures, backups e orçamento.
2. Medir baseline de repouso do banco/PostgREST/Realtime/Web, CPU, RAM, conexões e quantidade de requests.
3. Executar carga incremental pequena e controlada, com limites firmes de concorrência, duração e critérios de interrupção por latência/erro.
4. Verificar isolamento de empresas com dois controles positivos, cache local, integridade após falha, upload resumível e ausência de repetição de eventos.
5. Aumentar escala progressivamente apenas após corrigir gargalos com métricas antes/depois; **não** rodar 10.000 sessões sem capacidade verificada, aprovação de gastos e plano de interrupção/rollback.

A existência do script e do CI autoriza somente considerar **preparo do ferramental**, não conclusão do 6.3. Android API37 permanece com smoke experimental falho antes de executar o script do aplicativo; testes físicos Windows/Android e distribuição não foram homologados nesta frente.

Comando seguro somente para serviço local descartável previamente iniciado:

    DENTALFLOW_ISOLATED_PILOT_URL=http://127.0.0.1:3000/health node scripts/saas-isolated-pilot.mjs

Saídas não contêm URL ou dados do serviço. Não substituir URL por Cloud ou servidor real: o programa a rejeita por design.
