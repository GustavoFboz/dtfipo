# DentalFlow — Anexo Comercial, Operacional e Participação no Beta por Convite

**MINUTA INTERNA NÃO APROVADA, NÃO PUBLICADA — v0.1 — 10/11/2026.** Nenhum convite, cobrança, mudança de preço ou obrigação de suporte é gerada por este arquivo. A Prestadora, sua oferta final e a operação do beta precisam ser comprovadas.

## 1. Dados específicos da oferta

| Campo obrigatório antes de convidar cliente | Estado |
| --- | --- |
| Prestador pessoa física: nome civil, CPF sob guarda restrita, contato/endereço e identificação legal na oferta | `[PENDENTE: validar meio seguro, sem incluir CPF nesta minuta]` |
| Empresa participante, representante com poderes, contatos e serviços utilizados | `[PENDENTE: por convite]` |
| Identificador do plano e limites de usuários/sessões/armazenamento | `[PENDENTE: validar contra tabela de produção]` |
| Valor total, moeda, forma de cobrança, vencimento e tributos | `[PENDENTE: aprovação comercial/fiscal]` |
| Periodicidade e renovação/segundo ciclo | `[PENDENTE: prova do Asaas Sandbox]` |
| Regras de atraso, carência, suspensão, cancelamento e reativação | `[PENDENTE: homologação integrada]` |
| Datas de início/fim do programa piloto e condições de transição | `[PENDENTE]` |
| Suporte e privacidade (canais monitorados, horário, responsável) | `[PENDENTE]` |
| Número máximo inicial de empresas, aprovação nominal e mecanismo de convite | `[PENDENTE]` |
| Regras de exportação e saída segura, período de acesso e reversão | `[PENDENTE: prova técnica]` |

**R$5 e os preços de fixtures não constituem tabela comercial.** Cobranças reais são bloqueadas até validação do plano, aceite de todas as políticas aplicáveis e autorização expressa do responsável.

## 2. Objetivo, elegibilidade e convite

Beta restrito a empresas convidadas, com capacidade limitada e funcionalidades específicas apresentadas antes do cadastro. Convidado deve ser pessoa com autoridade para contratar; profissionais convidados para equipe **não podem aceitar contratos em nome da empresa** sem poderes próprios.

**Bloqueio importante:** a página pública do código atualmente oferece `Criar minha empresa` e `Escolher plano`. A existência de códigos empresariais para profissionais **não prova controle de adesão da empresa ao beta**. Antes de publicar, o **servidor** deverá exigir lista de convites/autorização de cadastro empresarial e impedir self-signup público; esconder botão na página não é controle suficiente. Prova exigida de tentativas não convidadas bloqueadas em endpoint backend e de empresas convidadas autorizadas.

## 3. Limites e expectativas

O beta tem risco de defeitos e atualizações; o cliente será informado das funcionalidades validadas, limitações e canais de incidente. Não usar a expressão “perda de dados é responsabilidade exclusiva do cliente”: a Prestadora preserva seus deveres próprios de segurança e diligência. Dados clínicos reais **somente** após backup verificável, isolamento aprovado, DPA/termos finais e homologação dos controles mínimos P0. Testes que precisam de falhas ou dados atípicos devem utilizar pacientes fictícios.

Metas de uptime, RTO/RPO, número de usuários simultâneos ou atendimento imediato não serão prometidas sem medição e anexo específico. Mudança de fornecedor e transferência internacional exigem avaliação e transparência conforme DPA.

## 4. Plano, cobrança e cancelamento

Proposta mostrará claramente preço, período, vencimento, limites e cobrança. Asaas cria cobranças por ciclo; o pagamento da renovação **não é necessariamente débito automático** em todas as modalidades. O beta não deve prometer pagamento e reativação instantâneos sem integração comprovada.

O participante terá fluxo de cancelamento/reembolso e possibilidade legal de contestação, com protocolo e efeito sobre o período pago. Suspensão por inadimplência pode restringir acessos, mas **não implica exclusão automática de dados de pacientes**. Procedimento de saída com exportação e preservação legal será definido e disponibilizado.

## 5. Suporte e urgências de privacidade

Canais e contatos ainda não foram definidos; não inventar e-mail ou prometer suporte 24 horas. Antes de abrir convites: nomear responsável, suplente, canal de suporte monitorado, canal de segurança/privacidade, faixas de atendimento, protocolo de incidentes, procedimento de escalonamento e teste de tempo de reação.

Classificação sugerida (sem SLA numérico aprovado):
- **Crítica:** exposição entre clínicas, credenciais/links expostos, indisponibilidade que ameace integridade clínica, cobrança indevida ou perda de dados — conter, bloquear novas adesões e ativar resposta a incidentes.
- **Alta:** falha ampla de login, edição de caso ou download/arquivo, erros de pagamento/reconciliação — prioridade operacional.
- **Normal:** ajustes de layout, dúvidas ou problemas não críticos — registrar e tratar no ciclo de suporte.

O canal de suporte não é substituto para atendimento odontológico emergencial. Proibir envio de prontuários em mensagens abertas.

## 6. Interruptor de emergência

O beta deve ter **controle no backend** de interrupção de **novas adesões, novos checkouts e novas cobranças de assinatura**, auditado, reversível e separado do acesso a dados existentes. Não é permitido implementar um botão que apague prontuários, desative backups ou cancele indiscriminadamente pagamentos já processados.

Requisitos: operador autorizado, registro de quem acionou e motivo, modo somente leitura ou bloqueio restrito quando necessário, restauração controlada, alertas ao suporte e forma de comunicar participantes. Teste automático com empresa não convidada deve comprovar bloqueio **no servidor**, inclusive sob requisição direta ao endpoint.

A implementação efetiva e seu aceite técnico **estão pendentes**; esta minuta não ativa um interruptor.

## 7. Comunicação, observabilidade e encerramento do beta

Mensagens transacionais obrigatórias devem ser separadas de marketing. Inscritos não autorizam propaganda, uso público de depoimentos, fotografias ou dados de pacientes por aceitar o beta. Telemetria deve ser sanitizada e com retenção definida. Encerramento do beta exige aviso e opções de continuidade/cancelamento/exportação sujeitos ao contrato.

## 8. Prova de aceite

Para cada empresa: identificador e representante autorizado, conteúdo/hash da versão de Termos e DPA, ciência da Privacidade, proposta com preço e plano, data UTC, origem da ação e prova de apresentação; todos em armazenamento restrito e imutável. Versão materialmente alterada exige fluxo apropriado de novo aceite. **Nunca aceitar pelo titular paciente, criar aceite retroativo ou considerar cadastro profissional sinônimo de contratação.**

**Estado final:** `PENDENTE`. Não vender, enviar convites externos nem alegar SLA/conformidade até aprovação jurídica e comercial, publicação versionada e prova dos gates de adesão e emergência.

Vinculado a: [Termos](SAAS-TERMS-DRAFT.md), [DPA](DPA-DRAFT.md), [Aviso](PRIVACY-NOTICE-DRAFT.md), [Runbook](LGPD-OPERATIONS-RUNBOOK.md).
