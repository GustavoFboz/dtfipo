# DentalFlow — inventário técnico de fornecedores, retenção e incidente

**Revisão técnica de 01/11/2026. ESTADO: INTERNO, NÃO APROVADO PELO JURÍDICO.**

O arquivo [`SUPPLIERS-RETENTION-INCIDENT-REGISTER.json`](SUPPLIERS-RETENTION-INCIDENT-REGISTER.json) é uma matriz de comprovação **do que o código efetivamente usa**. Os testes automatizados leem o código-fonte e falham caso esses fatos técnicos mudem sem atualizar o registro. Isso NÃO substitui DPA assinado, contrato de subprocessamento, avaliação de transferência internacional, inventário de operações/fluxos pessoais ou decisão do responsável.

## Fornecedores observados no código (sem presumir residência de dados)

| Integração | Comprovação de código | Região, contrato e suboperadores |
| --- | --- | --- |
| **Supabase** — login, PostgreSQL e Storage | `src/integrations/supabase/client.ts`: `createClient` e credenciais apenas via env | **Não validados contratualmente**; endereço de serviço e URL de API não comprovam datacenter ou transferência internacional |
| **Lovable** — hospedagem/desenvolvimento conectado | `docs/saas/IMPLEMENTATION-PROGRESS.md` e projeto Cloud publicado; não implica dono legal do tratamento | **Não validados contratualmente**, localidade e cadeia de fornecedores pendentes |
| **Asaas** — cobrança e notificações | `src/routes/api/billing/asaas-webhook.ts`, `receiveAsaasWebhook` | **Não validados contratualmente**, confirmar quais dados da clínica são transmitidos e obrigações fiscais |

Serviços de e-mail, analytics, log e suporte requerem inspeção própria antes de declarar inventário exaustivo. O uso de provedores não autoriza, por si só, repasse de dados clínicos.

## Retenção: diferenciar política efetiva de lacunas

| Categoria | Comprovado | Interpretação correta |
| --- | --- | --- |
| Dispositivo instalado | `MAX_OFFLINE_ACCESS_MS=3*24*60*60*1000` = **72 horas** | Limite de autorização offline após validação. Não comprova eliminação física em cada aparelho |
| Links assinados privados | `PRIVATE_FILE_URL_TTL_SECONDS=300` = **5 minutos** | Validade da URL de acesso, **não** prazo de armazenamento do arquivo |
| Registro de incidentes pessoais | **Mínimo regulatório de 5 anos**, ver Resolução CD/ANPD nº15/2024 | Obrigação do controlador sujeito à norma, **ainda não implementada como retenção automática** |
| Conteúdo clínico | **Pendente de definição jurídica/contratual** | Não presumir exclusão ao cancelar um plano nem expiração de backup |
| Histórico financeiro | **Pendente de definição jurídica/fiscal** | Não apagar ledger, faturas, recibos ou auditoria antes da análise do prazo correto |
| Arquivos históricos e backups | **Pendente** | Cópia histórica permanece incompleta, com 116 objetos ausentes |

## Incidentes de segurança: procedimento interno, não envio automático

1. Documentar data de ciência e descrição, categorias de dados, possível número de titulares, avaliação de risco/dano relevante, evidência protegida e medidas de contenção.
2. Definir papel do cliente controlador e do prestador operador **por tratamento**, acionar privacidade/jurídico e preservar sigilo clínico. Não enviar payload de prontuário a logs ou e-mail comum.
3. Havendo incidente confirmado com dados pessoais e risco/dano relevante, o controlador deve analisar **comunicação à ANPD e aos titulares**. A orientação oficial vigente indica **3 dias úteis**, ressalvadas legislação específica e exceções legais aplicáveis; o prazo não deve ser calculado automaticamente sem calendário e parecer.
4. Registrar fundamento da comunicação ou da não comunicação e o conteúdo da notificação. Usar canal oficial designado e representação do controlador; esta ferramenta não envia comunicados.
5. Manter o registro de incidentes pessoais pelo prazo mínimo regulatório de **5 anos**, salvo exigência superior. Os prazos de dados clínicos, outros logs e backups não são inferidos desse registro.
6. Após conter incidente, revisar o dano, correções e atualização contratual; testar recuperação apenas em ambiente autorizado.

**Fonte regulatória oficial:** [ANPD — Comunicação de Incidente de Segurança](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis) (atualizada em 26/08/2026); [Resolução CD/ANPD nº 15/2024](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-aprova-o-regulamento-de-comunicacao-de-incidente-de-seguranca).

## Checklist de incidentes (sem preencher dados reais neste repositório)

A estrutura interna em JSON exige `detected_at`, `incident_description`, `affected_data_categories`, `affected_people_estimate`, `risk_assessment`, `containment_and_mitigation`, `notified_anpd_or_people`, `decision_rationale`, `incident_owner`, `legal_review`. Instâncias reais ficam em repositório/acesso privativo aprovado, **nunca** no Git ou CI.

**Decisões externas ainda bloqueantes:** razão social, contatos oficiais, fornecedores contratados e regiões, assistência jurídica/privacy, bases LGPD das operações sensíveis, cronogramas de retenção, canal dos titulares, procedimento de contato e incidente testado, publicação de versões contratuais com aceite registrável.

Este registro é uma evidência de **inventário técnico com pendências explícitas**, não certificado LGPD, parecer jurídico ou termo vigente. O item 6.4 continua não homologado.
