# DentalFlow — Etapa 6/8: aprovação jurídica, privacidade e operação

**10/11/2026 — PACOTE DOCUMENTAL AMPLIADO, EM MINUTA INTERNA; JURÍDICO E OPERAÇÃO PENDENTES. NÃO PUBLICAR COMO TERMOS VIGENTES.** Nenhum pagamento ou cadastro real está autorizado por este documento. **Sem aceite formal, sem DPA assinado e sem publicação.**

## O que já existe e foi estruturado

- [Termos SaaS v0.2](SAAS-TERMS-DRAFT.md): prestação do software, escopo, profissionais, dados de saúde, preço, segurança, inadimplência, cancelamento, exportação, propriedade, confidencialidade e responsabilidades sem exclusão abusiva.
- [Aviso de Privacidade v0.2](PRIVACY-NOTICE-DRAFT.md): diferenças entre controladores, operadores e pacientes, dados sensíveis, bases legais, direitos, suboperadores, transferências, retenção, incidentes e telemetria.
- [DPA v0.2](DPA-DRAFT.md): instruções lícitas, matriz de controladoria, subprocessamento, segurança, notificação, incidentes, retenção, devolução, saída e auditoria.
- [Anexo de Beta e Suporte v0.1](BETA-PILOT-COMMERCIAL-ANNEX-DRAFT.md): proposta, preço, convites restritos, atendimento, limitações comprovadas e interrupção de novas adesões, sem apagar dados clínicos.
- [Aviso de Cookies e Telemetria v0.1](COOKIES-AND-TELEMETRY-DRAFT.md): dependente de inventário real dos SDKs/cookies e seus países.
- [Registro de operações ROPA preliminar](ROPA-PRELIMINARY.md), [RIPD preliminar](RIPD-PRELIMINARY.md) e [Procedimento de direitos, incidentes, retenção e saída](LGPD-OPERATIONS-RUNBOOK.md), com lacunas concretas e testes exigidos.
- [Registro de decisões pendentes e liberação bloqueada](BETA6-LEGAL-APPROVAL-REGISTER.json): fontes canônicas das aprovações não realizadas, sem presumir identidade da prestadora ou conformidade.
- [Inventário técnico prévio](SUPPLIERS-RETENTION-INCIDENT-REGISTER.md): Supabase, Lovable e Asaas observados no código; contratos, países, retenção final e subprocessadores ainda não foram comprovados.

## Matriz de conclusão

| Frente | Evidência preparada | Aceite operacional que falta |
| --- | --- | --- |
| L01 — identidade da Prestadora e representantes | Checklist/registro formal | Razão social/CNPJ/endereço, poderes, canais fiscais e suporte |
| L02 — mapa e papéis LGPD | ROPA + inventário e DPA | Validar bases do art. 11, controladores, menores, fornecedores, países e mecanismos de transferência |
| L03 — termos e preços | Minuta SaaS e Anexo do Beta | Preços reais/ciclos/limites/cancelamento/reembolso; advogado e negócio assinam revisão |
| L04 — privacidade e DPA | Documentos em v0.2 | Jurídico valida, DPA recebe dados concretos, empresa aprova e cliente/representante autorizado aceita |
| L05 — direitos, retenção e saída | Runbook/RIPD/ROPA | Canais, retenções legais/profissionais, exportação e protocolos testados sem dados reais |
| L06 — segurança e incidentes | Runbook e matriz de risco | Encarregado/dispensa, plantão, resposta a incidentes e evidências reais, logs sem prontuários |
| L07 — suporte/convite/emergência | Anexo de beta e critério de gate no servidor | Convidados limitados, canais verdadeiros, bloqueio backend de cadastro de empresa e novos checkouts, teste de parada |
| L08 — aceite versionado | SQL/cliente de recibo com hash SHA-256 já testado em PostgreSQL descartável e protegido por flag | Revisão e implantação controladas, documentação aprovada/publicada, UI real, contrato por representante e recibo válido; **PENDENTE** |

**Observação comercial:** o pagamento de teste de R$5 não define preço comercial nem autorização de venda. A simples preparação desta documentação **não equivale a aceite formal** de termos por representantes ou pacientes.

## Dados jurídicos que não podemos inventar

A Prestadora deve informar razão social, CNPJ, endereço, representantes, contatos, proposta comercial, canais de suporte e privacidade, estrutura de fornecedor, local de dados e prazos de retenção definidos com jurídico/contador. A inexistência de um e-mail/canal funcional ou ausência de contrato/DPA com subprocessador impede afirmar que a operação está regularizada.

A proteção contratual **não significa isenção de responsabilidade**. Termos não podem limitar o direito do paciente, converter consentimento em autorização genérica, eliminar regras de sigilo, permitir acesso interclínicas indevido, afastar LGPD/CDC ou transformar falha de segurança da Prestadora em responsabilidade exclusiva do cliente.

## Observações técnicas reais em 10/11/2026

1. Os ensaios Auth/REST/Storage e Web local com duas clínicas sintéticas foram aprovados (PRs #275, #279); **a paridade de hospedagem permanece pendente**. Os Termos não substituem essa prova.
2. Um backup histórico de 592 objetos e a recuperação externa de 116 objetos tiveram evidências de conferência e ensaio integrado **amostral** no Windows (etapa 3/8 concluída no escopo descrito). Não afirmar que os 708 foram abertos individualmente nem que versões hospedadas foram restauradas integralmente.
3. O código prevê autorização offline de 72 h e link assinado de 300 s; **não afirmar que esses valores são prazo universal de retenção, eliminação em qualquer aparelho ou indisponibilidade zero**.
4. O código já contém contrato de aceite versionado `src/lib/saas-legal-acceptance.ts` e DDL de ensaio `docs/saas/sql/saas-legal-versioned-acceptance-schema.sql`, **deliberadamente desativados**. Nada está publicado/aceito automaticamente; requer migração revista e UI com representante autorizado.
5. A página `src/routes/lp.tsx` ainda divulga cadastro de empresa/planos. Convidar profissionais de uma empresa não equivale a restringir **novas empresas**. Para beta por convite, gate backend e interruptor comercial devem ser validados antes de abrir o piloto.
6. A integração de cobrança Asaas tem simulações de ciclo e controles negativos, mas **a segunda cobrança em Sandbox real e as regras de cancelamento ainda não receberam aceite integrado**; evitar prometer renovação automática de qualquer modalidade.
7. Não há evidência de identidade legal da Prestadora, aprovação do encarregado/dispensa, canal efetivamente monitorado, lista final de subprocessadores e termos aprovados. Essas lacunas **não podem ser “resolvidas” por testes sintéticos de CI**.

## Protocolo de aprovação e publicação

1. A Prestadora preenche o registro `BETA6-LEGAL-APPROVAL-REGISTER.json` somente após documentação válida e revisões; não inventar `approved=true`.
2. Jurista brasileiro com experiência em SaaS, saúde e LGPD revisa os textos e marca mudanças/ressalvas; responsável de privacidade revisa ROPA/RIPD/papéis; contador e negócio validam preço/cancelamento/fiscal.
3. Engenharia confere o build Web/Android/Windows e fornece prova de versão/hash publicada, documento íntegro, modalidade de aceite, representante, clínica e recibo imutável.
4. QA ensaia pessoa não convidada, representante sem poderes, documento não aprovado, aceite de clínica alheia, atualização de versão, suporte e interrupção de novas vendas.
5. Aprovação final é registrada por pessoa, cargo, data, versão/sha e armazenamento restrito; o GitHub recebe **apenas evidência sanitizada**, não documentos pessoais, procurações, chaves ou prontuários.
6. Só então status da etapa 6 pode passar a `done`, enquanto o bloqueio comercial geral segue independente dos demais sete critérios P0.

**Estado final atual:** revisão jurídica pendente, aprovação de privacidade pendente, canal real pendente, aceite eletrônico publicado pendente. **Etapa 6 = pending; progresso do beta = 4/8 (50%).** Nenhuma autorização de produção/Asaas.

## Fontes normativas de consulta

[LGPD — texto consolidado](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html) · [ANPD — agentes e encarregado](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-para-definicoes-dos-agentes-de-tratamento-de-dados-pessoais-e-do-encarregado) · [ANPD — direitos](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares) · [ANPD — incidentes](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis) · [ANPD — transferência internacional](https://www.gov.br/anpd/pt-br/assuntos/assuntos-internacionais/transferencia-internacional-de-dados) · [ANPD — pequeno porte](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022).
