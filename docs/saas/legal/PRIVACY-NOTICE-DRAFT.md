# DentalFlow — Aviso de Privacidade para contas, profissionais, clientes e pacientes

**MINUTA INTERNA NÃO APROVADA E NÃO PUBLICADA — v0.2, 10/11/2026.** Não é aviso vigente, base legal automática nem certificação LGPD. Nome legal, canal, fornecedores, retenção e finalidade efetiva ainda dependem de confirmação e revisão jurídica. **Não cadastrar pacientes reais com fundamento exclusivo nesta minuta.**

## 1. Quem somos e como entrar em contato

O serviço DentalFlow será oferecido inicialmente por **pessoa física**, com nome civil `[PENDENTE]`, CPF `[PENDENTE: sob guarda privada, exposição pública/contratual a revisar conforme obrigação legal]`, município/UF `[PENDENTE]`, endereço físico profissional/de contato `[PENDENTE]`, e-mail de atendimento `[PENDENTE]` e canal de privacidade/titulares `[PENDENTE]`. A identidade do responsável pelo tratamento não será substituída apenas pela marca “DentalFlow”. CNPJ não é condição presumida nesta versão, mas cumprimento fiscal e transparência ao consumidor continuam sujeitos à lei. Identidade e contato do encarregado, ou avaliação documentada de dispensa legal aplicável ao agente pessoa natural de pequeno porte: `[PENDENTE]`. Nenhum e-mail deve ser inventado ou publicado antes de ser controlado pela Prestadora.

Ao usar o DentalFlow, a pessoa pode estar em duas situações distintas: **usuário profissional** da empresa contratante ou **paciente/demais titular** cujos dados foram incluídos por uma clínica, laboratório ou outro profissional. Esses grupos possuem relações jurídicas e canais de solicitação distintos.

## 2. Quem determina as finalidades

**Prestadora como controladora de finalidades próprias:** cadastro do usuário e da empresa, atendimento, suporte, operação e cobrança do SaaS, gestão de acesso, segurança e defesa de direitos quando for responsável por decidir esses tratamentos. Bases legais a validar por finalidade, sem aplicar a mesma base a todas.

**Contratante como possível controladora de dados clínicos:** ao decidir por que pacientes, fotos, escaneamentos, casos, modelos 3D, peças, solicitações e comunicações são cadastrados e compartilhados, a clínica/laboratório poderá ser controladora. O DentalFlow normalmente executa o tratamento clínico conforme suas instruções, na condição de operador, **quando essa for a relação efetiva**. Podem existir controladores independentes ou responsabilidades compartilhadas entre clínica, laboratório e profissionais; a análise não depende só da cláusula escrita.

**Titular paciente:** para acesso, correção ou eliminação de dados clínicos, normalmente contatar a clínica/profissional que determinou o tratamento; a Prestadora facilitará encaminhamento com verificação apropriada e não negará informação sobre suas próprias atividades de tratamento.

## 3. Categorias de dados e finalidades

| Categoria / titular | Exemplos e origem | Finalidade operacional e limites | Base legal/decisão |
| --- | --- | --- | --- |
| Identificação e contato de usuário profissional | Nome, e-mail, organização, papel, login e senha em sistema de autenticação; fornecidos pelo usuário/cliente | Provisionar conta e administrar acesso | Art. 7º da LGPD, fundamento a validar conforme relação |
| Dados de clínica/empresa | Razão social, identificadores, responsáveis, plano, quantidade de assentos | Gestão contratual, autorizações e suporte | Execução contratual/obrigações/defesa, conforme finalidade |
| Faturamento | Identificadores Asaas, status, faturas, valores, período, comprovantes e comunicações de pagamento | Cobrar, reconciliar, emitir documentos e atender exigências fiscais | Hipóteses aplicáveis do art. 7º, legislação fiscal |
| Pacientes/casos (sensíveis) | Identificação, histórico odontológico inserido, arquivos STL/3D, fotografias, radiografias quando incluídas, conversas e anexos | Execução de instruções clínicas/laboratoriais do cliente, comunicação autorizada e continuidade do trabalho | **Art. 11 para dados sensíveis**: cada controlador deve documentar hipótese válida; não presumir consentimento universal |
| Segurança e auditoria | Logs mínimos de login, data, conta, eventos de acesso e rastreabilidade | Prevenir fraude, investigar incidentes e proteger contas | Base aplicável após avaliação da finalidade e proporcionalidade |
| Dados locais instalados | Cache de dados já abertos em Windows/Android, tokens locais e operações pendentes | Desempenho e acesso limitado offline, conforme versão homologada | Tratamento ligado à operação e regras de segurança; controles devem ser comprovados |
| Atendimento e incidentes | Solicitações de suporte, protocolos e evidências sanitizadas | Resolver falhas, atender direitos e incidente, reduzir danos | Cumprimento de obrigações, defesa de direitos e bases apropriadas |

**Não coletar mais do que o necessário.** Se houver informações de crianças/adolescentes, aplicar seu melhor interesse, art. 14 da LGPD e salvaguardas reforçadas. Fotos odontológicas, imagens faciais, prontuários, conversas e arquivos de CAD não se tornam “anônimos” pelo fato de conterem apenas número de paciente ou pseudônimo se forem reidentificáveis.

## 4. Tratamento de dados sensíveis e consentimento

Dados de saúde são dados pessoais sensíveis. **O simples contrato entre DentalFlow e clínica não autoriza todos os tratamentos de dados de pacientes.** O controlador deve identificar hipótese do art. 11 para a finalidade concreta, incluindo eventuais requisitos da tutela da saúde, exercício de direitos e consentimento específico quando efetivamente exigido. Não confundir concordância contratual de representante de empresa, ciência desta Política e consentimento do paciente.

Quando a base for consentimento, informar finalidade específica, permitir manifestação destacada e registrar revogação e consequências dentro dos limites legais. Quando não houver consentimento como base, **não coletar checkbox de consentimento genérico para legitimar tratamento de saúde**. Dados clínicos não serão vendidos, usados para publicidade direcionada, mineração secundária ou treinamento de IA sem justificativa legal própria, instrução legítima e transparência apropriada.

## 5. Com quem podemos compartilhar

- **Entre usuários autorizados da mesma organização e participantes clínicos:** conforme autorização e finalidade definida pelos controladores, perfis de acesso e necessidade de saber. Invitar alguém não deve abrir, por si só, todos os pacientes de outra empresa.
- **Supabase** (autenticação, banco e armazenamento) e **Lovable/infraestrutura de Web** conforme arquitetura efetiva; entidades contratantes, países, datacenters, subprocessadores e contratos estão `[PENDENTES DE COMPROVAÇÃO]`.
- **Asaas** para pagamento e cobrança da organização, não como destinatário necessário de prontuários. Confirmar quais dados cadastrais/financeiros são transmitidos, suas próprias finalidades e obrigações.
- **Prestadores de suporte/monitoramento e e-mail:** somente os de fato ativados e homologados no inventário, com acesso restrito, finalidade específica e contrato adequado. Não inventar nomes, regiões, prazos ou afirmações de certificação.
- Autoridades públicas ou outros destinatários apenas nas hipóteses legais aplicáveis e na extensão necessária, preservando rastreabilidade.

**Transferência internacional:** pode ocorrer conforme o provedor, localização ou acesso remoto. Antes do lançamento, o mapa real deve identificar países, importadores, cadeia de operadores e mecanismo de transferência conforme os arts. 33–36 LGPD e a Resolução CD/ANPD 19/2024; não presumir exclusividade territorial brasileira.

## 6. Segurança, links e dispositivos

São esperados controles de autenticação, segmentação por empresa, menor privilégio, permissões de arquivos privados, monitoramento proporcional e resposta a incidentes. O ensaio técnico de duas clínicas em staging local é evidência específica, **não garantia de que cada dispositivo, integração ou ambiente hospedado já foi auditado**.

O código atualmente limita URLs privadas assinadas a cerca de 300 segundos; isso diz respeito ao **link temporário**, não à duração do arquivo armazenado. Aplicativos instalados têm política de autorização offline de até 72 horas após validação online, mas a operação e a limpeza em aparelhos reais precisam de homologação antes de promessa contratual. Criptografia, salvamento em pasta local, backups históricos e restauração têm limites próprios; não supor que todo dado local já está cifrado ou que nenhum arquivo persiste em backup.

Pessoas usuárias devem proteger dispositivos, não compartilhar credenciais, revogar acessos de ex-colaboradores e comunicar suspeitas por `[PENDENTE: canal de segurança]`. A Prestadora tem deveres independentes de proteger seus sistemas e de gerir vulnerabilidades.

## 7. Retenção, eliminação, exportação e cancelamento

| Dados | Princípio / prazo a confirmar |
| --- | --- |
| Conta e identificação de usuários | Prazo necessário ao contrato, segurança, obrigações legais e defesa de direitos: **não definido nesta minuta** |
| Faturas, registros de pagamento e fiscal | Legislação aplicável e exigências do contador e provedor: **a validar** |
| Dados de pacientes e prontuário, quando aplicável | Prazos legais/profissionais e instruções do controlador; a Lei 13.787/2018 prevê 20 anos a partir do último registro como regra de eliminação de prontuários abrangidos, podendo haver prazos específicos: **não aplicar indiscriminadamente a cada STL ou arquivo de laboratório** |
| Logs de acesso da aplicação | Avaliar art. 15 do Marco Civil: em caso de aplicação à Prestadora, seis meses de guarda protegida; diferenciar logs de acesso de logs clínicos e de diagnóstico |
| Registro de incidentes pessoais | Regulamento ANPD 15/2024: em geral, cinco anos no registro do controlador, sem substituir outros prazos |
| Caches de instalação e links privados | 72 h é autorização offline e 300 s é expiração de URL; **não são prazos de retenção da base** |
| Cópias históricas e backups | Ciclos, backups imutáveis, prazo e procedimentos de exclusão pendentes de prova e contrato |

O encerramento de assinatura não exclui automaticamente dados clínicos; as operações de disponibilização, retenção, bloqueio e eliminação são distintas, e obrigações legais/profissionais podem exigir preservação. Não prometemos eliminação instantânea em todas as cópias nem restauração íntegra sem prova técnica.

## 8. Seus direitos

Nos termos da LGPD, conforme aplicabilidade, você pode solicitar confirmação e acesso, correção, informação sobre compartilhamentos, anonimização/bloqueio/eliminação em hipóteses legais, portabilidade quando regulamentada, revogação de consentimento e revisão de decisões automatizadas quando cabível. A identidade e o vínculo com a organização devem ser verificados por meios proporcionais e seguros, sem exigir prontuário inteiro por e-mail.

**Canal efetivo:** `[PENDENTE: endereço eletrônico controlado pela Prestadora]`. Encaminhamento para o controlador clínico conforme a finalidade. A LGPD prevê confirmação/acesso simplificado imediatamente e declaração completa em até 15 dias nos casos do art. 19; outros pedidos seguem as regras pertinentes e não recebem um prazo genérico fictício. A pessoa pode acionar a ANPD pelos canais oficiais.

## 9. Incidentes, comunicação e transparência

Um incidente é avaliado por natureza do dado, número de pessoas, consequências, proteção empregada e risco/dano relevante. O operador informará o controlador sem atraso indevido e cooperará; o controlador responsável comunicará à ANPD e titulares quando couber nos prazos legais. O prazo geral da Resolução CD/ANPD 15/2024 é de **três dias úteis** para incidentes qualificáveis, observadas exceções e prazos específicos. Registros de incidentes devem ser mantidos conforme exigido, inclusive se não houver obrigação de comunicar. Não publicar relatos ou prontuários nos logs e canais de comunicação.

## 10. Cookies e telemetria

A autenticação pode exigir tecnologias essenciais de sessão. **Inventário de cookies, SDKs, analytics e finalidade ainda pendente**. Cookies não essenciais não devem ser ativados só porque o usuário aceitou os Termos; a necessidade de consentimento/opt-out será avaliada à luz do guia da ANPD, com escolhas efetivas e não condicionamento inadequado. A Prestadora não promete ausência de todo terceiro sem verificar o build hospedado.

Logs de erro e métricas de beta devem usar dados mínimos e **não incluir nome, fotos, escaneamentos, textos de chat, prontuários, links assinados, tokens ou payloads**.

## 11. Alterações e contato

Atualizações relevantes serão versionadas e informadas conforme suas consequências. Mudanças de finalidade/base legal/suboperador, país ou tempo de guarda requerem avaliação, aviso e/ou autorização cabível, não apenas troca silenciosa de arquivo. A aceitação de contrato de empresa **não substitui** a ciência ou os direitos dos pacientes. Histórico de documentos publicados e aceitos precisa permanecer acessível ao representante e protegido contra alteração.

**Aprovação ainda faltante:** identidade, contatos, encarregado/dispensa avaliada, mapa de fornecedores e países, dados concretos do Asaas, operações sensíveis, prazos de retenção, termos aprovados e publicação técnica versionada.

**Fontes:** [LGPD consolidada](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html), [ANPD — titulares](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares), [ANPD — transferências internacionais](https://www.gov.br/anpd/pt-br/assuntos/assuntos-internacionais/transferencia-internacional-de-dados), [ANPD — incidentes](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis), [Lei 13.787/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13787.htm).
