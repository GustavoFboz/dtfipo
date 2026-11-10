# DentalFlow — Registro preliminar das operações de tratamento (ROPA)

**INVENTÁRIO INTERNO V0.1, NÃO HOMOLOGADO — 10/11/2026.** Responsáveis e hipóteses são proposições para revisão; não é declaração de conformidade. Cada operação requer fonte, finalidade, controlador/operador, fundamento jurídico, transferência e retenção verificados antes de inserir dados clínicos reais.

## Matriz funcional

| Código | Operação/dados | Titulares | Possível papel do DentalFlow | Finalidade e fundamento a verificar | Sistemas e destinatários | Retenção/país/status |
| --- | --- | --- | --- | --- | --- | --- |
| R01 | Cadastro da empresa e representante, plano, razão social e contato | Representantes e equipe | Controlador em contratação | Execução do contrato, obrigações legais, defesa de direitos conforme art. 7º | App, Auth, DB | `PENDENTE` |
| R02 | Autenticação, sessões, papéis, convite de membros e recuperação de acesso | Usuários profissionais | Controlador em segurança própria e/ou operador por instrução | Segurança, prevenção de acesso indevido, contrato; base por finalidade | Supabase Auth, Web, Android, Windows | `PENDENTE` |
| R03 | Cobrança recorrente, assinatura, status, cancelamento, comprovantes | Representantes/pagadores | Controlador de cobrança própria | Contrato, obrigação fiscal, exercício de direitos; confirmar compartilhamento | Asaas, DB, webhook | `PENDENTE` |
| R04 | Cadastro de pacientes e dados odontológicos | Pacientes e responsáveis legais | Operador sob instrução clínica, se papéis assim confirmados | Finalidade clínica/laboratorial, **base do art. 11** identificada pelo controlador | Banco, profissionais autorizados | `PENDENTE` |
| R05 | Casos, observações, modelos STL/3D, fotos, anexos e scans | Pacientes e profissionais | Operador, com possíveis relações entre controladores | Produção/execução de trabalho e comunicação clínica; fundamento art. 11 | Storage, chat, membros e parceiros legitimamente autorizados | `PENDENTE` |
| R06 | Mensagens de chat e notificações entre clínica/laboratório | Pacientes identificáveis indiretamente, equipe | Operador ou controlador por operação | Coordenação de tarefas, segurança e notificação proporcional | DB, realtime, push `[PENDENTE: fornecedor]` | `PENDENTE` |
| R07 | Estoque e dados comerciais operacionais da clínica | Pessoas autorizadas e eventuais pacientes associados | Varia por fluxo | Gestão do cliente, contratual ou instrução | Banco e dispositivos | `PENDENTE` |
| R08 | Suporte e revisão de erro | Usuários e eventuais pacientes expostos em evidências | Controlador do suporte; operador se acessar conteúdo clínico | Atendimento e investigação estritamente necessária, com acesso excepcional | Plataforma de suporte `[PENDENTE]` | `PENDENTE` |
| R09 | Logs de autenticação/acesso, auditoria e segurança | Usuários e identificáveis por metadados | Controlador para segurança própria; outras funções sob instrução | Proteção e cumprimento de obrigações; avaliar Marco Civil | Web/DB/logs `[PENDENTE]` | Avaliar art. 15 da Lei 12.965/2014 |
| R10 | Cache local Windows/Android e arquivos exportados | Usuários, pacientes | Operador conforme dados | Desempenho/acesso offline, segurança e finalidade clínica original | Dispositivos de usuários, pastas locais | 72 h de autorização técnica, limpeza efetiva `PENDENTE` |
| R11 | Backups criptografados, cópias históricas e recuperação | Pacientes e usuários | Operador/controlador conforme operação | Continuidade, guarda legal, defesa | Backup e Storage `[PENDENTE]` | Restaurabilidade, país e prazos `PENDENTE` |
| R12 | Marketing, cookies não essenciais, analytics e telemetria | Usuários/visitantes, não pacientes | Controlador se implementado | Finalidades separadas; legítimo interesse apenas onde admissível, consentimento quando necessário | Cookies/SDKs `[PENDENTE]` | Inventário técnico `PENDENTE` |
| R13 | Pedidos de titular, notificação de incidente e investigação | Profissionais, pacientes e reclamantes | Depende do dado; controlador para sua obrigação | Cumprimento de obrigação legal, defesa e medidas de segurança | Ferramenta privada de protocolo `[PENDENTE]` | Registro de incidente ANPD mínimo 5 anos quando aplicável |

## Perguntas obrigatórias por linha

1. **Quem controla a finalidade e quem pode ordenar tratamento?** Definir se clínica, laboratório, profissional ou DentalFlow; preservar evidência da decisão, não assumir relação só porque o cliente pagou a assinatura.
2. **Qual a hipótese legal exata?** Validar separadamente dado não sensível art. 7º, dado de saúde art. 11, criança/adolescente art. 14; nunca usar legítimo interesse para dados sensíveis.
3. **Quais dados mínimos, tela, campo e usuários são necessários?** Limitar coleta, acesso, exportação e logs; negar cruzamento clínico não autorizado.
4. **Qual fornecedor realmente tem acesso?** Registrar nome contratante, serviço, suboperadores, local, país, transferência internacional e contrato/DPA.
5. **Qual prazo e evento inicial?** Separar clínico, contas, financeiro, acesso, incidente, arquivo, cache e cópias; registrar exclusão/hold.
6. **Qual prova técnica de efetividade?** Teste com duas clínicas, exportação segregada, transparência ao titular, logs mínimos, dispositivos, pagamento e recuperação.

## Fluxos em maior risco

**Fluxo paciente → caso → anexo → chat → especialista/laboratório:** pode atravessar relações de controladoria e conter dado sensível. Validar autorização e propósito **antes** de ampliar permissões por convite. O cliente deve entender quando terceiros verão conteúdo e como revogar vínculos.

**Fluxo aparelho:** a autorização offline de 72 h não prova limpeza de arquivos baixados manualmente, print, exportação ou cópia em sistemas de arquivos. Informar o limite real e orientar dispositivos protegidos.

**Fluxo Asaas:** não transmitir prontuários, STL, radiografias ou conversas; comparar payload real de createCustomer, subscription, checkout e webhook com o inventário de dados financeiros, sem registrar chaves.

**Fluxo fornecedor internacional:** resolver contratação, regiões e mecanismos ANPD 19/2024 antes de afirmar data residency no Brasil.

## Base operacional

Vincular cada operação à [Privacidade](PRIVACY-NOTICE-DRAFT.md), [DPA](DPA-DRAFT.md), [Procedimentos LGPD](LGPD-OPERATIONS-RUNBOOK.md) e [Inventário de fornecedores](SUPPLIERS-RETENTION-INCIDENT-REGISTER.md). O registro só pode sair do status `PENDENTE` após evidência técnica e decisão de responsável com data.

**Fontes:** [LGPD consolidada](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html), [ANPD — definição de agentes](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-para-definicoes-dos-agentes-de-tratamento-de-dados-pessoais-e-do-encarregado).
