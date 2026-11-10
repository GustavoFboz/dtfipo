# DentalFlow — Ficha de informações para finalizar Termos e LGPD

**Checklist simplificado para preencher depois, sem bloquear o desenvolvimento atual.** Não compartilhar documentos pessoais, senhas ou dados de pacientes no chat público nem no repositório. A aprovação jurídica e operacional será documentada apenas com protocolos sanitizados.

## Bloco A — Identidade de quem venderá o DentalFlow

1. Nome legal de quem prestará o SaaS (razão social), CNPJ e nome fantasia, se houver. Se a empresa ainda não existir formalmente, isso deve ser resolvido com contador/advogado **antes de vender**.
2. Endereço empresarial/cidade/UF (dados necessários para o contrato); endereço de correspondência diferente, se houver.
3. Nome/cargo do representante com poderes para firmar contratos pela Prestadora e canal institucional (telefone/e-mail, sem incluir dados privados desnecessários).
4. Quem será responsável por proteção de dados (encarregado) **ou** quem fará a análise jurídica formal de eventual dispensa; contato de privacidade/segurança sob controle da empresa.
5. E-mail/site de suporte verdadeiros, horário possível e responsável/suplente pelo atendimento.

## Bloco B — Como será comercializado

6. Quais tipos de empresa contratarão (laboratório, clínica, radiologia etc.) e se haverá profissionais/autônomos assinando individualmente.
7. Planos e preço reais por mês, limites de sessões/usuários, armazenamento, recursos incluídos e eventuais excedentes. **R$5 do teste não é preço final.**
8. Meio de pagamento permitido, ciclo, vencimento, renovação, atraso, carência, suspensão, reativação, cancelamento, reembolso e emissão fiscal; validar juridicamente e no Asaas Sandbox.
9. Quantas empresas participarão do primeiro beta e como serão selecionadas; quem decide autorizar/retirar convites.
10. O que é **beta/teste** e quais limitações serão divulgadas; quais compromissos de suporte e disponibilidade são realmente viáveis.

## Bloco C — Onde os dados serão tratados

11. Contas/contratos efetivamente contratados de Supabase, Lovable ou outra hospedagem, Asaas, serviços de e-mail, logs, monitoramento e suporte — razão social/entidade, localização, país, cadeia de subprocessadores e DPA.
12. Quem decide o tratamento clínico: se clínica, laboratório e profissional são controladores independentes, conjuntos ou operador; como pacientes, escaneamentos, fotos, chat e equipe são compartilhados.
13. Se existem pacientes menores e se dados clínicos serão usados em diferentes jurisdições; identificar a hipótese legal do art. 11 da LGPD por finalidade clínica, com orientação do advogado e profissionais de saúde.
14. Quais categorias de documentos têm obrigação de guarda profissional e por quanto tempo; regras fiscais/contábeis, logs, backups e processo de saída/exportação.
15. Quais dados e informações são enviados para suporte, monitoramento, SMS/e-mail/push, integrações de IA ou serviços externos, se existirem. Não habilitar uso secundário de prontuários por padrão.

## Bloco D — Quem aprova e como provar

16. Nome e OAB do advogado/revisor quando contratado; aprovação da Prestadora e do responsável de privacidade; versão final de Termos, Privacidade, DPA e Anexo do Beta.
17. Comprovação de que o representante da clínica tem poderes; aceite por versão/hash do documento e do preço, data/hora, clínica e usuário.
18. Testes de backend e UI: documento pode ser lido antes da assinatura, não existe checkbox pré-marcado, documento não aprovado não é oferecido, histórico de versão é acessível; convite de empresa não autorizada é negado.
19. Responsáveis e teste de parada de novas vendas/checkouts; resposta a incidente, pedidos de titular e backup/exportação sem apagar clínicas ativas.
20. Aprovação expressa de abertura do beta, **separada** da aprovação documental e dos gates financeiros/hospedagem.

## Ordem recomendada para não sobrecarregar

**Primeira rodada quando for conveniente:** apenas itens 1–5 e 6–10 (identidade, contatos, planos e beta). A engenharia pode preparar a trilha de aceite enquanto jurídico e contador validam 11–20. Não é preciso enviar documentos sigilosos nem responder tudo de uma vez.

**Resultado esperado:** Termos e Privacidade sem colchetes, DPA específico para clientes/fornecedores, condições de preço e suporte efetivas, canal de direitos ativo, mecanismo de aceite por versão em staging, contratos e evidências restritas. Só então a etapa 6 poderá marcar `done`.

**Atenção:** um “termo que proteja a empresa de tudo” é juridicamente irrealista. Documentos equilibrados, decisões rastreáveis e segurança operacional testada dão proteção mais defensável do que cláusulas abusivas que tentem afastar LGPD ou direitos dos pacientes.
