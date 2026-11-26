# DentalFlow — Procedimentos de LGPD, segurança, incidentes, retenção e saída

**PROCEDIMENTO INTERNO EM MINUTA v0.1 — 10/11/2026; não é procedimento em operação, SLA aprovado, comunicação feita ou certificado de conformidade.** O acesso a incidentes e solicitações reais será restrito fora do GitHub. Canais e responsáveis devem ser formalizados antes da publicação.

## 1. Governança, papéis e trilha

- **Responsável de privacidade:** `[PENDENTE]`; encarregado ou análise de dispensa documentada `[PENDENTE]`.
- **Responsável de segurança/plantão:** `[PENDENTE]`; suplente `[PENDENTE]`.
- **Representante da Prestadora:** `[PENDENTE]`; responsável pela publicação/cobrança: `[PENDENTE]`.
- **Cliente controlador:** organização e encarregado ou contato indicado `[PENDENTE: por cliente]`.
- **Registro sigiloso:** protocolo interno em cofre/serviço de tickets com controle de acesso, expiração e retenção `[PENDENTE]`; não usar repositório, comentários de PR ou log público para dados reais.
- Todo procedimento tem responsável, data/hora, origem, quem autorizou, documento base, resultado e destinatário — **sem conteúdo de prontuário** na trilha de auditoria administrativa.

## 2. Direitos de titulares: fluxo prático

1. Receber solicitação por `[PENDENTE: canal de privacidade]` e dar número de protocolo. Guardar contato mínimo, categoria do direito, data de ciência, origem e controladoria sugerida.
2. Confirmar identidade com meio proporcional; **não exigir fotografia do documento inteiro ou prontuário por e-mail aberto** sem justificativa e canal seguro. Não aceitar apenas saber nome, CPF ou número de paciente para revelar dados de saúde.
3. Identificar se DentalFlow decide finalidade própria (conta, cobrança, suporte) ou atua como operador de organização controladora; quando clínico, encaminhar ao controlador adequado e registrar destinatário e data, sem fornecer dados de outro cliente.
4. Classificar: confirmação/acesso, correção, portabilidade, eliminação/bloqueio/anonimização quando cabível, informação sobre compartilhamento, revogação do consentimento específico, oposição ou revisão de decisões automatizadas, conforme LGPD.
5. Verificar retenção legal (prontuários, fiscal, incidentes, litígio), conflito de obrigações profissionais, controle de identidade e destinatários; aprovar plano de atendimento ou fundamentar negativa legal específica. Não apagar por mera alegação em chat.
6. Executar com controle de versão, logs de ação mínimos e relatório sanitizado; conferir arquivos, chat, anexos, backups conforme capacidade e autorização.
7. Comunicar a decisão por canal seguro. Para art. 19 LGPD, a confirmação/acesso simplificado deve ser imediata e a declaração completa no prazo legal de até 15 dias; **não generalizar esses 15 dias para toda solicitação**. Responder prontamente e controlar prazos específicos com jurídico.
8. Encerrar protocolo apenas quando houver confirmação de entrega ou decisão fundamentada; registrar pedido e capacidade de revisão.

**Teste de mesa exigido antes do beta:** paciente fictício de clínica A pede acesso; solicitação é encaminhada ao controlador A sem revelar quaisquer dados da clínica B. Outro teste pede eliminação com guarda legal e comprova decisão fundamentada sem destruição indevida.

## 3. Incidentes: triagem imediata e comunicação

1. Isolar credenciais, sessão, dispositivo, link e serviço afetados, preservando evidências protegidas e linha do tempo; nunca divulgar chaves.
2. Registro mínimo: data de ocorrência e ciência, descrição, categoria e quantidade de titulares (incluindo menores/idosos quando aplicável), categorias sensíveis, sistemas, país, medidas adotadas, dano/risco, severidade, decisão legal e responsáveis.
3. **Prestadora como operadora:** acionar sem demora injustificada o controlador da operação, com informações disponíveis. Meta interna de `[PENDENTE: primeira notificação ao controlador após detecção]`, com plantão e canal realmente testados.
4. **Prestadora como controladora própria:** aplicar análise de relevância e comunicações obrigatórias na sua esfera.
5. **Controlador responsável:** avaliar se incidente pode acarretar risco ou dano relevante aos titulares; se preenchidos os requisitos, regra geral da Resolução 15/2024 exige comunicar ANPD e titulares em **três dias úteis**, ressalvadas exceções e prazos legais específicos. A contagem e eventual complementação devem ser validadas juridicamente. Não presumir dispensa de pequeno porte.
6. Manter registro de incidentes de dados pessoais por **pelo menos cinco anos**, salvo outras obrigações; incluir motivo fundamentado de não comunicar. Restringir acesso e revisar pós-incidente.
7. Exercitar contatos, recuperação e evidência real em cenário fictício; nunca disparar notificação a titulares reais ou ANPD por teste.

**Critérios de risco:** quantidade e sensibilidade dos dados (saúde, menores), reidentificação, autorização indevida entre clínicas, acesso a arquivos assinalados, exposição de tokens, potencial discriminação/dano e eficácia da contenção. Priorizar isolamento de login, arquivos privados, compartilhamento e exportação.

## 4. Retenção e descarte: decisões por categoria

**Não existe prazo único para tudo.** Antes da liberação preencher a matriz com base/fundamento, prazo, evento inicial e ferramenta de execução testada:

| Categoria | Base ou referência | Decisão em aberto |
| --- | --- | --- |
| Prontuários clínicos abrangidos pela Lei 13.787/2018 | Art. 6º: prazo mínimo de 20 anos após último registro, possíveis prazos diferenciados e outras obrigações | Aplicabilidade a cada artefato, quem guarda, exportação e quem pode autorizar eliminação |
| Casos laboratoriais, STL, fotos, mensagens e outros anexos | Finalidade e contratos; não presumir que todos sejam prontuário | Distinguir documentos obrigatórios, metadados, versões e subcontroladores |
| Contas, equipe e identificação | Contrato, segurança, direitos e outras bases legais | Prazos, exclusão de usuário vs conta, logs e auditoria |
| Faturas, pagamentos Asaas, notas e comprovantes | Fiscal/contábil, prevenção a fraude, defesa de direitos | Contador determina prazo efetivo por classe, base e marco |
| Registros de acesso à aplicação | Avaliar Marco Civil art. 15 (se aplicável, guarda por 6 meses sob sigilo) | Quais eventos são registros de acesso e como proteger |
| Incidentes pessoais e decisões | ANPD 15/2024, mínimo 5 anos para controlador sujeito à regra | Ferramenta e responsável de arquivo restrito |
| Dados em cache Windows/Android | Janela de autorização offline de até 72 h após login válido em código | Medir limpeza física, logout, troca de empresa, falhas de sincronização |
| URLs temporárias de arquivos | TTL técnico de 300 segundos | Não confundir TTL com remoção do objeto armazenado |
| Backups e arquivos históricos | Política de continuidade, guarda e obrigações profissionais | Inventário, ciclo de backups, restauração, exclusão segura e exceções |

**Quarentena/hold:** uma obrigação legal, processo judicial, incidente ou necessidade de prontuário pode exigir suspensão de exclusão, com prazo/revisão documentados. **Não aplicar deleção em lote nem restaurar sobre produção para “testar LGPD”.**

## 5. Encerramento do contrato e portabilidade

Ao cancelar assinatura: confirmar pedido/representação, direitos do período pago, efeito de suspensão e conta responsável. Prover procedimento assistido de exportação após verificar autoridade, categoria e direitos de terceiros; empacotar com criptografia/links de curta duração quando tecnicamente comprovados, conferir integridade e registrar entrega sanitizada. Solicitar instrução de eliminação por categoria ao controlador apropriado, executar somente depois da guarda obrigatória e conciliação com backups, emitir protocolo de conclusão com ressalvas de cópias legalmente preservadas. Prazo para exportação e encerramento: **[PENDENTE: medir e aprovar antes do contrato]**. Exportação de uma clínica nunca pode conter outra.

## 6. Segurança operacional e acesso interno

- Contas administrativas e chaves de serviço em gerenciador restrito; segregação de ambientes de teste/produção, revisão de mínimo privilégio, MFA adequado, rotação de segredos e trilha de alteração.
- Anexos, fotos e escaneamentos de pacientes somente em armazenamento privado com validação de empresa/caso; URLs assinadas são credenciais temporárias e não devem aparecer em logs/e-mails.
- Suporte técnico deve preferir logs com códigos sanitizados e fixtures. Acesso excepcional a prontuários exige autorização de responsável, motivo, prazo e auditoria.
- Backup/restauração com ensaio de dados sintéticos ou cópia autorizada; não transportar PHI a CI pública. Testar perda de dispositivo e limpeza local separadamente.
- Monitoramento do beta não pode conter dados pessoais sensíveis em logs, stacktraces, URLs, IDs reidentificáveis, chat, anexos ou dashboards públicos. Retenção de telemetria: **[PENDENTE: política técnica e acesso]**.
- Falhas no envio de incidente, no atendimento ao titular, na segurança de armazenamento ou na restauração criam **bloqueio de lançamento**, não apenas alerta informativo.

## 7. Avaliação de impacto (RIPD) e revisão periódica

Realizar inventário de atividades (ROPA), mapear dados e fluxo por serviço, finalidade e base; riscos de fotos/saúde/crianças/compartilhamento transclínica e efeitos de suspensão; avaliar probabilidade/severidade e salvaguardas. Anexar `RIPD-PRELIMINARY.md`. Revisar com privacidade/jurídico antes do beta; renovar após mudança de fornecedor, país, nova função de IA, módulo ou compartilhamento. A ANPD pode exigir RIPD em situações aplicáveis; a minuta não substitui relatório validado por controlador e encarregado.

## 8. Simulações obrigatórias antes da liberação

Cenários isolados: (a) paciente da clínica A não acessível à B; (b) solicitação de direito com identidade; (c) incidente com exposição de link/credencial e contenção; (d) exportação da clínica A sem dados da B; (e) cancelamento sem apagamento de prontuário; (f) restauração íntegra sem expor clínica de terceiro; (g) limpeza de cache em aparelho, se prometida. Para cada um salvar data, ambiente, versão, resultado, responsável e hash da evidência sanitizada, nunca material clínico real.

**Fontes regulatórias:** [ANPD incidente](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis); [ANPD direitos](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares); [Lei 13.787/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13787.htm); [Lei 12.965/2014](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm).
