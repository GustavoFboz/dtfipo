# DentalFlow — protocolo jurídico e operacional do SaaS

Versão 0.1, 05/10/2026. Status: planejamento para elaboração posterior dos
documentos, sem publicação de termos ou declaração de conformidade.
Responsável pela aprovação de negócio: Gustavo. Responsáveis jurídicos,
privacidade, suporte e contabilidade: a designar.

Esta frente integra o aceite da etapa 6/7 do RELEASE-PLAN.md. Os IDs L01–L08
organizam o trabalho documental e não alteram o contador das sete etapas técnicas.
Documentos precisam corresponder ao serviço efetivamente testado.

## Sequência e entregáveis

| ID | Ação e documentos posteriores | Dependências e critério de conclusão |
| --- | --- | --- |
| L01 — enquadramento | Ficha da empresa, escopo comercial e matriz de responsabilidades | Confirmar razão social, CNPJ, endereço, representação, canais e público atendido; jurídico e contador validam contratação e emissão fiscal. |
| L02 — inventário | Registro das operações de tratamento e mapa de fornecedores | Listar dados, titulares, finalidade, base legal, papéis, acessos, localização, transferências, retenção e destinatários de cada operação; confrontar com código e contratos dos fornecedores. |
| L03 — relação com clientes | Contrato SaaS/termos de uso, anexo de planos e política de assinatura | L01–L02; definir preço, vigência, reajuste, limites, cancelamento, inadimplência, exportação, suporte e escopo beta; validar comportamento com etapas 2/7 e 5/7. |
| L04 — transparência e tratamento | Aviso de privacidade e acordo de tratamento de dados com clientes (DPA) | L02; separar dados de conta/cobrança dos dados clínicos; descrever instruções, subprocessadores, confidencialidade, incidentes, direitos e saída; revisão jurídica e técnica. |
| L05 — atendimento e retenção | Procedimento de direitos dos titulares, tabela de retenção e plano de encerramento | Canal e responsáveis definidos; ensaiar identificação, encaminhamento ao controlador, resposta, exportação, preservação legal e eliminação inclusive de cópias locais/backups. |
| L06 — segurança e continuidade | Política interna de segurança, resposta a incidentes, backup/restauração e avaliação de impacto | Mapear riscos clínicos, fornecedores e dispositivos; registrar medidas existentes e pendentes; testar acesso, revogação, recuperação e incidentes. Avaliar necessidade de RIPD, sem tratá-lo como certificação automática. |
| L07 — operação | Anexo de suporte/SLA, manual de onboarding e termos do piloto | Capacidade, horários, canais, disponibilidade, recuperação e limitações medidos na etapa 6/7; compromissos comerciais devem respeitar esses resultados. |
| L08 — aprovação e aceite | Registro de versões, aprovações e aceites contratuais | Jurídico revisa minutas; negócio aprova condições; engenharia comprova recursos; disponibilizar cópia dos documentos e evidência de versão, representante e data do aceite antes de contratar. |

Ordem: L01 e L02 primeiro; L03–L07 podem avançar em paralelo após o inventário;
L08 encerra a revisão. Nenhuma minuta em branco será apresentada como contrato final.

## Fatos necessários antes das minutas

- Identidade da empresa prestadora, representante e canais públicos de suporte
  e privacidade; indicação do encarregado ou justificativa documentada de
  eventual dispensa aplicável. Pequeno porte não será presumido pelo faturamento.
- Público contratante, vínculo clínica/laboratório/profissional e participação
  de pacientes, responsáveis e menores; autoridade de quem cadastra ou compartilha.
- Catálogo e preço comerciais de Produção, cobrança recorrente, reajustes,
  carência, suspensão, cancelamento, reembolso e política de downgrade.
  O preço de homologação existente não é tabela comercial aprovada.
- Fornecedores efetivos: Lovable/infraestrutura contratada, Supabase/Auth/Storage,
  Asaas, hospedagem, e-mail, monitoramento e demais serviços realmente usados.
  Conferir pessoa jurídica, contrato, região, acesso remoto e subcontratados.
  Não presumir hospedagem exclusivamente brasileira nem retenção zero.
- Prazos de guarda por categoria, necessidade de sigilo profissional, cópias
  offline, exportação, remoção ao fim do contrato e recuperação de backups.
- Horários e capacidade reais de suporte; resultados de restauração; disponibilidade
  e prazos de recuperação ainda não medidos permanecem sem promessa numérica.

## Matriz inicial a validar por operação

| Operação | Hipótese inicial de papel | Decisão necessária |
| --- | --- | --- |
| Conta, contratação, cobrança e suporte do SaaS | Prestadora pode atuar como controladora dessas finalidades próprias | Definir bases legais e retenção; limitar acesso e informações enviadas ao Asaas. |
| Dados clínicos tratados conforme instruções do cliente | Cliente pode ser controlador e prestadora operadora | Validar relação concreta, instruções e acessos; não definir papéis apenas pelo nome do contrato. |
| Compartilhamento entre clínica, laboratório e especialistas | Papéis dependem das decisões de cada participante | Documentar finalidade, autorização, necessidade e responsabilidade do destinatário. |
| Segurança, auditoria e obrigações legais | Papel e base dependem da finalidade | Separar logs de acesso, auditoria clínica, faturamento e diagnóstico; evitar payload clínico nos logs. |
| Uso secundário, analytics, treinamento de IA ou marketing | Sem autorização genérica pelo contrato SaaS | Inventariar se existe; não adicionar uso de dados clínicos para essas finalidades nesta rodada. |

Dados de saúde são sensíveis (LGPD, art. 5º, II). Cada finalidade clínica exige
avaliação das hipóteses do art. 11; execução de contrato do art. 7º, V não basta
por si só para dados sensíveis. Consentimento não será usado como justificativa
universal nem confundido com aceite comercial. A hipótese de tutela da saúde
tem condições próprias e não autoriza indiscriminadamente todo tratamento pelo SaaS.

## Requisitos de engenharia que sustentam os documentos

| Requisito | Evidência ou pendência atual | Etapa técnica |
| --- | --- | --- |
| Separação por empresa e menor privilégio | Barreiras de casos/pacientes implementadas; testes HTTP de fixtures relatados; revisão das demais superfícies permanece aberta | 4/7 |
| Identidade, sessão e administração | Login/MFA/logout relatados nas fixtures; recuperação pendente; leitura Master AAL1 faz parte do contrato atual; replay financeiro exige AAL2 e prova própria | 4/7 |
| Acesso a arquivos privados | Há URLs persistidas de um ano em anexos de pacientes e dez anos em fotos/avatar; revisar renovação autorizada, cache por identidade e tratamento de URLs antigas | 3/7 e 4/7 |
| Cancelamento sem perda clínica | Comprovar ciclo de assinatura e exportação; não prometer exclusão imediata de todo dado ao cancelar a cobrança | 2/7 e 5/7 |
| Cobrança e mudança de plano | Transporte de atualização Asaas existe; executor da solicitação e reconciliação ainda precisam de aceite | 5/7 |
| Continuidade e dispositivos | Testar restauração, suspensão/prazo offline, troca de conta e proteção das cópias locais nos aplicativos instalados | 6/7 |
| Aceite documental | Inventariar eventual mecanismo existente; implementar versão imutável/hash, empresa, representante, data, documento e trilha de alterações com acesso restrito | L08 e 6/7 |

A redução da validade dos links exige renovação autorizada e comportamento
equivalente nos aplicativos. Não encurtar links persistidos sem resolver a
abertura posterior. Políticas de acesso não invalidam automaticamente URLs
assinadas já emitidas; qualquer estratégia de invalidação precisa de validação
do provedor e plano que preserve os objetos clínicos.

## Procedimentos a escrever e ensaiar

1. **Titulares:** receber protocolo por canal definido; confirmar identidade com
   dados mínimos; identificar operação e controlador; encaminhar ou responder;
   registrar decisão e prazo aplicável. Não divulgar dados de outra empresa.
   Não prometer um prazo único para todos os direitos da LGPD.
2. **Incidentes:** registrar ciência, conter, preservar evidências, avaliar risco
   e impacto; prestadora operadora comunica o controlador sem demora indevida;
   controlador avalia e realiza comunicações legalmente exigidas. A regra geral
   da Resolução ANPD 15/2024 é três dias úteis para comunicar à ANPD e titulares
   quando presentes os requisitos, observadas as regras e exceções aplicáveis.
   Definir aviso interno mais rápido como meta operacional, ainda a aprovar.
3. **Retenção e saída:** separar cobrança, conta, logs, conteúdo clínico, backups
   e cópias locais; definir finalidade, prazo, marco inicial, fundamento e quem
   autoriza eliminação. Cancelamento financeiro não elimina prontuário.
   Verificar aplicação da Lei 13.787/2018 e regras profissionais ao conteúdo
   concreto; não transformar um prazo de prontuário em prazo universal do SaaS.
4. **Logs:** avaliar enquadramento no art. 15 do Marco Civil, inclusive guarda
   de registros de acesso a aplicações por seis meses quando aplicável;
   distinguir esse registro de auditoria clínica e conteúdo de atendimentos.
5. **Transferências:** identificar país/região e acesso internacional de cada
   fornecedor; determinar mecanismo permitido pela LGPD e regulamentação ANPD;
   revisar contratos e transferências posteriores antes de afirmar adequação.
6. **Cookies e comunicações:** inventariar cookies/SDKs e finalidades antes de
   decidir se há política específica e consentimento necessário. Marketing,
   contratos e autenticação têm fluxos e escolhas diferentes.
7. **Oferta e faturamento:** jurídico avalia CDC/comércio eletrônico conforme
   relação concreta, mesmo com contratantes empresariais; contador valida regime,
   enquadramento fiscal e emissão. Não prometer dispensa de direitos por contrato B2B.

## Protocolo de aprovação e evidências

Cada item terá ID, responsável nominal, dependências, data, versão, evidência
sanitizada, riscos e decisão. Status permitidos: pendente, em elaboração,
em revisão, aprovado e publicado. Aprovação exige nome e data; publicação exige
versão aprovada, acesso à cópia e teste do fluxo de contratação.

Guardar inventários e evidências sem senhas, tokens ou conteúdo clínico em
repositório de acesso amplo. O repositório de código contém este plano;
contratos assinados, registros de titulares e incidentes ficam em armazenamento
restrito definido na operação. Revisar a matriz quando mudar módulo, fornecedor,
país de tratamento, prazo de guarda ou finalidade; reavaliar antes de Produção.

## Fontes oficiais e escopo da revisão

Consultadas em 05/10/2026. Revalidar texto vigente e normas adicionais antes
da aprovação das minutas. Esta lista é ponto de partida, não parecer jurídico.

- [LGPD — Lei 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm): dados sensíveis, bases legais, direitos, agentes, segurança e governança.
- [Guia ANPD de agentes de tratamento](https://www.gov.br/anpd/pt-br/documentos-e-publicacoes/Segunda_Versao_do_Guia_de_Agentes_de_Tratamento_retificada.pdf): avaliar papéis pela operação efetiva.
- [ANPD — comunicação de incidentes / Resolução 15/2024](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis): requisitos e procedimento de comunicação.
- [ANPD — Resolução 19/2024](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-19-de-23-de-agosto-de-2024): transferências internacionais e cláusulas-padrão.
- [Marco Civil — Lei 12.965/2014](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm): privacidade, contratação e registros de acesso.
- [Lei 13.787/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13787.htm): digitalização e guarda de prontuários; verificar escopo clínico aplicável.

A revisão jurídica também deverá conferir normas sobre encarregado e agentes
de pequeno porte, CDC/comércio eletrônico, obrigações profissionais e eventuais
regras adicionais para menores. Seus enquadramentos ainda não estão aprovados.
