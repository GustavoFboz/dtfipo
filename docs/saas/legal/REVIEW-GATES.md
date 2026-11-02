# DentalFlow — Registro de aprovação e lacunas jurídicas

**01/11/2026 — DOCUMENTOS EM ELABORAÇÃO; NÃO LIBERADOS PARA CLIENTES.**

Base: `docs/saas/LEGAL-OPERATIONS-PROTOCOL.md`, versão 0.1. Pacote de minutas:
[Termos SaaS](SAAS-TERMS-DRAFT.md), [Aviso de privacidade](PRIVACY-NOTICE-DRAFT.md),
[Anexo de tratamento (DPA)](DPA-DRAFT.md).

| Frente | Situação verificável | Evidência / próximo aceite |
| --- | --- | --- |
| L01 — identidade contratante/prestadora | PENDENTE | Razão social, CNPJ, contato fiscal/privacidade, representante e canal de suporte |
| L02 — inventário de tratamento e fornecedores | INVENTÁRIO TÉCNICO REVISADO (não aprovado juridicamente) | [Registro de fornecedores, retenção e incidentes](SUPPLIERS-RETENTION-INCIDENT-REGISTER.md); integrações comprovadas no código, **contratos, regiões, transferências e cadeia de subprocessadores não verificados** |
| L03 — termos SaaS | MINUTA | Revisão de preço comercial, suspensão, cancelamento, exportação e responsabilidades |
| L04 — privacidade/DPA | MINUTA | Revisão das funções reais de controlador/operador, bases legais art. 11, subprocessadores |
| L05 — direitos e retenção | PARCIAL (inventário de prazos efetivos) | Offline de 72 horas e URLs de 300s comprovados por código, obrigação de registro de incidentes por 5 anos distinguida de retenção de conteúdo; definição de prazos clínicos/financeiros, canal de direitos e testes operacionais pendentes |
| L06 — segurança/continuidade | PARCIAL | Matriz interna de registro/triagem de incidente com campos obrigatórios e referência ANPD; **não é resposta real a incidente**, nem decisão do controlador. Backup integral, aparelhos e revisão legal pendentes |
| L07 — SLA e onboarding | PENDENTE | Capacidade piloto, horários/contatos de suporte e métricas de recuperação |
| L08 — revisão jurídica e aceite versionado | PENDENTE — mecanismo técnico isolado, não publicado | SQL/cliente e ensaio descartável [PR #240](https://github.com/GustavoFboz/dtfipo/pull/240) preparados; **aprovação assinada, conteúdo real, integração da UI e implantação seguem pendentes** |

**Bloqueio jurídico:** até receber revisão por advogado responsável, validação empresarial, canal e documentação de fornecedores, nada deve ser apresentado como texto vigente ou política LGPD implementada. Dados de saúde são sensíveis e o enquadramento das hipóteses legais deve ser validado conforme operação; cuidado para não tratar consentimento como solução universal.

**Bloqueio técnico:** 12 registros históricos de pacientes sem clínica e 116 objetos históricos ausentes do backup não devem ser ocultados pelos termos. Não afirmar exclusão integral após cancelamento, recuperação completa de dados, atendimento a 10.000 simultâneos ou uso offline homologado em todos os aparelhos.

**Bloqueio comercial:** os pagamentos de R$5 e Growth R$449 citados em testes Sandbox não são tabela comercial aprovada. A plataforma não está liberada para venda pela simples criação deste pacote.

## Critérios de liberação 6.4

1. Inventário técnico de integrações e roteiro de atribuições conferidos com código e testes — **feito somente no plano técnico**; regiões, contratos/DPA, transferências e prestadores adicionais continuam sujeitos a revisão real.
2. Minutas de Termos, Aviso e DPA com lacunas explícitas — **preparadas como material interno**.
3. Matriz de prazos efetivos/legais e template de resposta a incidentes **preparados e validados contra código/ANPD**; prazo clínico, financeiro, resposta real, responsáveis e procedimento operacional **não aprovados**.
4. Revisão jurídica + privacidade com assinatura, identidade da prestadora e aprovação comercial — **pendente**.
5. Publicação versionada + aceites imutáveis e testes de contratação — **pendente**.

A marcação de minutas como preparadas **não** constitui revisão jurídica, implantação em app ou aceite formal de 6.4. Evidência em `docs/saas/IMPLEMENTATION-PROGRESS.json` deve continuar limitada.

## Referências oficiais para revisão

- [LGPD consolidada — Câmara dos Deputados](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html)
- [ANPD — definições de agentes e encarregado](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-para-definicoes-dos-agentes-de-tratamento-de-dados-pessoais-e-do-encarregado)
- [ANPD — regras para pequeno porte](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022)

Nem o enquadramento de pequeno porte nem a dispensa de encarregado devem ser presumidos.
