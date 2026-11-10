# DentalFlow — Avaliação preliminar de impacto à proteção de dados (RIPD)

**MODELO INTERNO NÃO APROVADO — 10/11/2026.** É levantamento inicial de riscos para suporte a um futuro RIPD, **não** um relatório completo/aprovado, certificação ou aprovação da ANPD. Preenchimento deve ser feito pelo controlador competente, com apoio do operador e jurídico/privacidade.

## 1. Contexto e justificativa

DentalFlow processa potencialmente **dados de saúde sensíveis** (pacientes odontológicos, fotos, modelos 3D, anexos e comunicações) e permite colaboração entre empresas. Isso aumenta as consequências de acesso indevido, uso secundário, perda de dados, exposição de dispositivos e indisponibilidade. A ANPD considera dados sensíveis e tratamento capaz de afetar direitos critérios relevantes para análise de alto risco; seu enquadramento depende do caso concreto, e **a condição de empresa pequena não elimina a obrigação geral de cumprir a LGPD**.

Responsáveis: `[PENDENTE: controlador por finalidade, encarregado/dispensa, segurança e jurídico]`. Sistema/versão: `[PENDENTE: SHA de deploy]`. Finalidade, hipótese legal e categorias por atividade: [ROPA preliminar](ROPA-PRELIMINARY.md). Localização de fornecedores e fluxo internacional: `[PENDENTE]`. Escala prevista vs escala medida: `[PENDENTE]`.

## 2. Metodologia a validar

Risco é tratado por: ameaça, probabilidade, impacto nos direitos/liberdades dos titulares, medidas existentes **com evidência** e risco residual. Classificação proposta: baixo / médio / alto / crítico. Não chamar um controle de “implementado” por constar em documentação; separar **testado em QA local**, **testado em hospedagem**, **não testado** e **pendente de contrato**.

## 3. Riscos e salvaguardas

| ID | Ameaça | Impacto potencial | Medida comprovada ou exigida | Risco residual |
| --- | --- | --- | --- | --- |
| P01 | Clínica A acessa paciente/caso/anexo da B | Violação de sigilo clínico, discriminação, dano moral | Teste de duas empresas/Auth/Storage/Web em CI local aprovado; falta paridade da hospedagem e todos os módulos | **ALTO até QA hospedado** |
| P02 | Link privado de foto/STL vazado ou URL persistida | Acesso não autorizado, reidentificação | Código atual usa links assinados temporários de ~300 s; testar cópias, vazamento, download e revogação no host | **ALTO** |
| P03 | Captura de login, contas compartilhadas e acesso de ex-funcionário | Exposição/alteração de casos | Credenciais pessoais, revisão de papéis, MFA e revogação a comprovar em instâncias/dispositivos | **ALTO** |
| P04 | Dispositivo Windows/Android roubado com dados offline | Exposição persistente, alterações não sincronizadas | Janela de autorização offline de 72 h em código; comprovar criptografia local, expiração e limpeza física nas builds | **ALTO** |
| P05 | Perda de backup ou arquivo clínico durante queda, cancelamento, migração | Perda de história clínica e trabalho | Ensaios isolados de restauração; inventário de backups e acesso a dados de produção ainda exigem conciliação | **ALTO** |
| P06 | Webhook de cobrança incorreto e suspensão indevida | Negativa de acesso profissional e indisponibilidade de dados | Testes SQL de preços divergentes/ambiente cruzado passam; validar segundo ciclo Asaas Sandbox real e plano de contingência | **ALTO** |
| P07 | Uso de fotos/modelos para marketing/IA sem fundamento | Uso incompatível, violação de direitos | Proibição documental proposta; auditar logs, telemetria, integrações e contratos com terceiros | **ALTO** |
| P08 | Suboperador externo e transferência internacional sem salvaguarda | Tratamento irregular e acesso de terceiros | Inventário preliminar Supabase, Lovable, Asaas; regiões, DPA e mecanismo ANPD 19/2024 pendentes | **ALTO** |
| P09 | Falha de notificar incidente sensível no prazo | Agravamento do dano, sanção administrativa | Fluxo de incidente desenhado; definir plantão/canais, testar relógio/escala e decisor controlador | **ALTO** |
| P10 | Pedido de titular revela dados de outra empresa ou elimina prontuário | Violação de sigilo e guarda | Procedimento LGPD desenhado; simular pedido e operação de exportação/retention hold | **ALTO** |
| P11 | Usuário sem convite cria organização e passa a comprar no beta | Acesso não homologado e tratamento não autorizado | Página possui self-signup empresarial; implementar gate no **servidor**, não só ocultar botão | **ALTO** |
| P12 | Contrato/privacidade aceito sem versão ou autoridade da empresa | Prova contratual inválida, consentimento confuso | SQL de aceite com SHA/versionamento foi testado isoladamente, mas está **desativado**; publicar somente após revisão, testar UI e migração | **ALTO** |

## 4. Recomendações para reduzir riscos antes do beta

1. Confirmar responsável, canal, base art. 11 e papel de cada participante; adaptar termos/DPA.
2. Completar inventário de fornecedores, contrato de suboperação, acesso internacional e mecanismos permitidos.
3. Validar homologação real de Auth/RLS/Storage e plano de restauração/rollback na hospedagem escolhida.
4. Instalar e testar aceite versionado para representante com poderes, separado de eventual consentimento de paciente.
5. Testar controle de convite empresarial **no backend**, limite de participantes e parada de checkouts sem afetar dados clínicos.
6. Ensaiar retenção, exportação, revogação de equipe, cache offline, resposta de incidentes e direitos.
7. Implantar telemetria sem conteúdo clínico, prazo e acesso limitado.
8. Homologar Asaas Sandbox, segundo ciclo e suspensão/cancelamento de forma a não comprometer registros clínicos.

## 5. Decisão e revisão

**Decisão atual:** `NÃO APROVADO`. Não utilizar dados reais adicionais nem vender o beta com base neste documento. Auditoria da prestadora, controlador clínico e encarregado/jurídico devem indicar gravidade, medidas e risco residual por linha. Se risco alto persistir, definir mitigação/aceite formal ou suspender função antes do piloto; **a aceitação interna de risco não elimina obrigação legal**.

Data de revisão: `[PENDENTE]`; controladores participantes: `[PENDENTE]`; responsável jurídico `[PENDENTE]`; versão/assinatura `[PENDENTE]`.

Referências: [ANPD — RIPD](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/relatorio-de-impacto-a-protecao-de-dados-pessoais-ripd), [ANPD — pequeno porte](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022), [LGPD](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html).
