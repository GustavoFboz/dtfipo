# DentalFlow — Acordo de Tratamento de Dados Pessoais (DPA)

**MINUTA INTERNA, NÃO ASSINADA, NÃO APROVADA, NÃO VIGENTE — v0.2, 10/11/2026.** Usar como anexo do contrato SaaS apenas após definição jurídica das partes, papéis, instrutores, fornecedores, responsabilidades e anexos. Não constituem instruções válidas dados falsos ou campos pendentes.

**Contratante/Controlador proposto:** `[PENDENTE: nome/razão social, CPF/CNPJ quando aplicável, endereço, representante autorizado e canal de privacidade]`. **Prestador/Operador proposto:** **pessoa física** responsável pelo DentalFlow, `[PENDENTE: nome civil completo]`, CPF `[PENDENTE: guarda privada, não colocar no código]`, endereço profissional/de correspondência `[PENDENTE]` e contato de privacidade `[PENDENTE]`. A condição de pessoa natural não dispensa medidas técnicas, deveres legais, sigilo nem análise de transferência internacional.

## 1. Papel e interpretação

Este DPA se aplica **somente às operações nas quais a Contratante realmente determina finalidades e meios essenciais do tratamento de dados clínicos e a Prestadora executa o tratamento em nome dela**. Para conta, segurança própria, suporte, cobrança e obrigações da Prestadora, sua função pode ser de controladora independente, regida pelo Aviso e pela LGPD. Tratamentos entre clínicas, laboratórios e profissionais podem ter controladores distintos ou compartilhados, a serem identificados em instrumento específico, não automaticamente qualificados como “operações da clínica”. A designação contratual não prevalece sobre as funções de fato (guia ANPD).

## 2. Instruções documentadas e limites

A Prestadora só tratará informações clínicas segundo instruções **lícitas, específicas, registráveis e compatíveis** com o contrato, incluidas operações necessárias de hospedagem, organização de casos, comunicação autorizada, upload/download, cópia de segurança e restauração. Solicitações fora do escopo exigem autorização documentada e revisão das finalidades. Quando instrução aparentar infringir a LGPD ou ordem judicial, a Prestadora deverá alertar a Contratante, podendo limitar o tratamento ilícito na medida juridicamente permitida.

**Proibição:** compartilhar dados clínicos entre empresas por simples existência de conta, vender dados, perfilhar pacientes para anúncio, treinar sistemas de IA com dados clínicos, ampliar acesso de suporte ou reter cópias para finalidade própria sem fundamento legal e autorização apropriados. A equipe de suporte não deve solicitar arquivos clínicos por canais informais quando alternativa técnica segura existir.

## 3. Instruções básicas — anexar antes de assinar

| Campo contratual | Situação e decisão |
| --- | --- |
| Categorias de titulares | Pacientes, profissionais da odontologia, funcionários, representantes, responsáveis legais, inclusive menores quando aplicável; **confirmar** |
| Tipos de dados | Identificadores, fotos odontológicas/faciais, escaneamentos, modelos STL/3D, radiografias quando inseridas, casos, comunicações, arquivos e metadados; **confirmar** |
| Finalidades | Operação de laboratório/clinica, acompanhamento e compartilhamento de trabalhos específicos; **detalhar por fluxo** |
| Hipótese legal | Análise individual do controlador, inclusive **art. 11** para dados sensíveis; consentimento não presumido |
| Operações | Coleta por cliente, transmissão, hospedagem, leitura autorizada, cópia, exportação, compartilhamento, retenção e eliminação |
| Prazo | Contrato e guardas legais com calendário de retenção aprovado; não inferir automaticamente dos 72 h offline |
| Países/fornecedores | `[PENDENTE: contratos, localização, países, subprocessadores, acesso remoto, medidas]` |
| Contato para incidentes e titulares | `[PENDENTE: endereço monitorado, responsáveis e escalonamento]` |
| Canais de saída/exportação | `[PENDENTE: formato, identidade, cronograma e ensaio de exportação]` |
| Parâmetros de serviço | `[PENDENTE: SLA medido, janelas, limites e contingência]` |

## 4. Obrigações da Contratante

Definir e documentar hipóteses legais por finalidade, em especial dados sensíveis; respeitar sigilo profissional, regras dos conselhos e melhor interesse de crianças/adolescentes; informar pacientes e responsáveis conforme exigência aplicável; comprovar base e autoridade de cada compartilhamento; provisionar/revogar acessos; adotar senhas individuais e dispositivos protegidos; não publicar dados de pacientes em canais de suporte inseguros; manter cópia e plano de continuidade quando exigidos pelas suas responsabilidades profissionais. Não exigir tratamento proibido por lei.

As instruções da Contratante não afastam deveres de segurança, confidencialidade e resposta a incidentes próprios da Prestadora.

## 5. Obrigações da Prestadora

Aplicar medidas técnicas/organizacionais adequadas ao risco: segregação efetiva de organizações, acesso mínimo por perfil, autenticação, logs proporcionalmente protegidos, proteção de dados em trânsito e repouso quando comprovada, controle de segredos, monitoramento sem prontuários, proteção de anexos, gestão de vulnerabilidades, continuidade e controle da cadeia de operadores. Restringir pessoal autorizado mediante compromissos de confidencialidade e procedimentos de revogação.

Cooperar com direitos de titulares, avaliação de impacto (RIPD), solicitações de autoridade, investigações, auditorias proporcionais (sem expor outros clientes), exportações e eliminação autorizadas. Guardar trilha mínima das instruções e provas de execução sem incluir payload clínico em auditoria. **Não declarar certificações, mecanismos criptográficos universais, backups íntegros ou SLA que não tenham evidência técnica e contrato.**

## 6. Suboperadores e transferências internacionais

Subcontratação que envolva dados pessoais deve ter transparência, contrato adequado, instruções compatíveis, medidas equivalentes e mecanismo de inclusão/objeção definido juridicamente. Anexo atualizado deverá registrar para cada fornecedor: razão social/entidade, atividade, categorias tratadas, país e região, acesso de suporte, subprocessadores posteriores, retenção, mecanismo de transferência, avaliação de riscos e contrato vigente.

Prestadores observados no código: **Supabase** (Auth/DB/Storage), **Lovable** (hospedagem/ambiente de desenvolvimento efetivo a validar), **Asaas** (pagamentos; não assumir que atua como suboperador clínico). Outros fornecedores de e-mail, observabilidade e infraestrutura precisam ser verificados. **Não presumir que qualquer provedor possui datacenter brasileiro, DPA assinado, certificado específico ou transferência regularizada.** Se houver transferência internacional, verificar o mecanismo do art. 33 LGPD e Resolução ANPD 19/2024, incorporando a íntegra das cláusulas-padrão quando aplicáveis, sem modificá-las em resumo contratual.

Mudanças relevantes de subprocessador/país/finalidade devem seguir procedimento de avaliação, informação prévia e oportunidade de objeção legítima definida no contrato. Cláusula de objeção e prazo: `[PENDENTE: jurídico]`.

## 7. Incidentes e comunicação

Ao identificar incidente que afete ou possa afetar dados tratados em nome da Contratante, a Prestadora deverá **comunicar a Contratante sem atraso injustificado** pelos contatos aprovados, preservar evidência com acesso restrito, informar a cronologia, categorias afetadas, medidas e avaliação preliminar de risco disponíveis, cooperando com investigação e contenção. Meta interna de aviso inicial `[PENDENTE: 24 horas ou prazo proporcional à capacidade de plantão real]` **não é prometida até comprovação operacional**.

O controlador responsável avalia e efetua comunicações oficiais aos titulares e à ANPD quando presentes requisitos legais; para incidentes qualificáveis a regra geral da Resolução ANPD 15/2024 é **três dias úteis**, ressalvadas exceções e normas específicas. Como controladora de suas próprias finalidades, a Prestadora responde por suas comunicações pertinentes. Ambas mantêm registros de incidentes pelo prazo e escopo aplicáveis, inclusive decisões de não comunicar e documentação dos riscos.

**Não emitir comunicação automática sem triagem jurídica e de segurança.** Informações médicas ou chave de paciente não devem constar do protocolo público de incidente.

## 8. Atendimento aos titulares

Solicitações de pacientes recebidas pela Prestadora serão protocoladas, verificadas por meio proporcional e encaminhadas ao controlador clínico correto, sem permitir extração de dados de outra empresa. A Prestadora executará ações instrucionadas de consulta, correção, exportação ou eliminação conforme permissões técnicas, retenção legal e salvaguardas de identidade; esclarecerá tratamento de que seja controladora independente quando couber.

O art. 19 LGPD prevê declarações simplificadas imediatas e completas em até 15 dias nos casos previstos, mas a resposta exige comprovação de identidade, papel e relação; não usar esse prazo indiscriminadamente para qualquer solicitação. Canal e fluxo de escalonamento: `[PENDENTE]`.

## 9. Retenção, devolução, suspensão e encerramento

A Prestadora devolverá/exportará ou eliminará dados por instrução válida, no formato tecnicamente disponível e mediante confirmação de autoridade, respeitando obrigações de retenção, ordens legais, prontuários, prevenção a fraudes, conflito entre controladores e preservação de provas. Cronograma e formulário de saída: `[PENDENTE: validar formato e duração dos backups]`. Prazo comercial de expiração, logs técnicos, backups e cópias locais devem ser **explicitados por categoria e por fundamento**; não confundir 72 h de acesso offline ou cinco minutos de link com eliminação física dos dados.

Suspensão de acesso por inadimplência não significa apagamento, portabilidade concluída ou autorização para reter dados indefinidamente. A Prestadora não deve destruir registros de pacientes necessários à continuidade legal/profissional sem procedimento documentado. Destruição deve ter certificado/relatório sanitizado e ressalva de backup segundo política aprovada.

## 10. Auditoria, responsabilidade, transferência e vigência

A Contratante pode solicitar evidências proporcionais de segurança e conformidade; formatos, prazos, custos, confidencialidade e acesso a auditorias independentes serão definidos no contrato. Solicitações não devem revelar dados de outra empresa ou segredos desnecessários.

As partes respondem por atos e omissões que lhes sejam imputáveis, observadas LGPD, CDC quando aplicável, regras profissionais e regime legal de responsabilidade; nenhuma cláusula deste DPA exclui deveres de segurança, direitos dos titulares ou sanções legais. Limitações e regras de regresso serão objeto de parecer específico. Regime de resolução de disputas: `[PENDENTE]`.

Vigência acompanha as operações de tratamento e obrigações remanescentes de confidencialidade, retenção, cooperação e defesa de direitos, sem presumir exclusão total automática. O cliente deverá ter acesso ao texto final e histórico de alteração.

## 11. Evidência de aceite

Cada versão deverá ser publicada **somente após aprovação jurídica e comercial documentada**; o sistema deve armazenar documento imutável, SHA-256, data, identidade do representante com poderes, empresa, versão do DPA e da proposta, protocolo de aceite e possibilidade de reabertura/cópia. A existência da RPC SQL ou de uma flag de aceite não comprova publicação nem concordância dos pacientes. Nenhuma assinatura retroativa, caixa pré-marcada ou aceite coletivo silencioso.

**Campos obrigatórios faltantes:** identidade civil/CPF e assinatura do Prestador PF, identificação e poderes do cliente, matriz real de funções e bases legais, suboperadores e contratos, transferência internacional, canais, retenção/saída, condições de SLA e resposta, revisão jurídica, publicação e implantação testada. **SEM APROVAÇÃO / SEM ASSINATURA.**

**Referências:** [LGPD consolidada](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html), [ANPD — agentes de tratamento](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-para-definicoes-dos-agentes-de-tratamento-de-dados-pessoais-e-do-encarregado), [ANPD — transferência internacional](https://www.gov.br/anpd/pt-br/assuntos/assuntos-internacionais/transferencia-internacional-de-dados), [ANPD — incidentes](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis).
