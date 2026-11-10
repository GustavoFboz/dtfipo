# DentalFlow — Especificação de implementação dos Termos versionados

**Plano técnico, NÃO publicado/ativado — 10/11/2026.** O contrato de banco versionado e a função `record_saas_legal_acceptance` já estão preparados para ensaio isolado. A flag `VITE_SAAS_LEGAL_ACCEPTANCE_ENABLED` está desativada por padrão. Aprovar esta documentação **não autoriza ativá-la em produção**, publicar minutas ou criar aceites retroativos.

## Fluxo obrigatório do cliente empresarial

1. **Antes do cadastro ou checkout**, a página pública deve mostrar links legíveis para Termos, Aviso de Privacidade e proposta/planos reais. Versões aprovadas podem ser servidas por rota pública de leitura **somente de documentos publicados**, sem expor rascunhos. O SQL atual concede `SELECT` apenas a usuários autenticados; é preciso planejar com segurança como oferecer leitura antes do login (por exemplo, cópia estática pública da versão *aprovada* com SHA próprio, testada), e nunca abrir acesso a versões draft por RLS.
2. O cadastro de empresa deve exigir **convite empresarial validado no backend** e identificar representante com poderes para contratar. O código atual exibe `Criar minha empresa` em `src/routes/lp.tsx`; isso **não é invite-only completo**. Gate de convite e botão de parada comercial exigem testes de endpoint.
3. Antes da contratação, apresentar em tela a proposta **com preço, moeda, plano, limite, vencimento, condições de renovação/cancelamento**, sem usar preço fictício ou informação escondida. Mostrar cópia dos documentos e permitir abertura e impressão; privacidade é ciência/transparência, não consentimento genérico de paciente.
4. Solicitar concordância afirmativa **não pré-marcada** e específica com Termos e DPA por quem tem representação legítima; manter a leitura do Aviso separada. Não reunir consentimento de cookies opcionais, marketing ou dados sensíveis em um único “aceito tudo”.
5. Enviar para o backend apenas ID de versão publicada e SHA esperado; o servidor confere o conteúdo e o ator proprietário legitimado (sem acreditar na clínica indicada pelo browser). O código/procedimento existente cobre parte disso. Registrar instante UTC, empresa, representante, IP/UA somente quando necessário e permitido, preço/versão de proposta, documento SHA, versão e recibo; **não registrar senha, payload clínico ou token**.
6. Recibos e versões publicadas precisam ser **imutáveis**. Publicar versão seguinte para corrigir erro, preservando histórico; mudanças materiais podem exigir aceite posterior. O servidor deve negar checkout/ativação quando o recibo obrigatório está ausente, expirado ou de outra empresa; verificar que login de profissional convidado não substitui assinatura do representante.
7. Fornecer cópia do contrato, documentos aceitos e canal de suporte; registrar acesso e eventual revogação/contestação quando legalmente aplicável.
8. O checkout Asaas em produção permanece **separadamente bloqueado** pelos oito P0. Implementar e testar em QA com duas empresas e documentação **sintética**, antes de qualquer migração real; nenhuma flag de “legal acceptance” substitui autorização financeira.

## Requisitos de segurança/QA

- Minuta **não** pode ser considerada publicada por existir no GitHub; versão aprovada deve ter SHA-256 verificável, referência de aprovação assinada/registrada e estado published.
- Teste cruzado: dono A não pode aceitar para clínica B; membro e visitante não podem assinar; hash divergente, draft, versão retirada/antiga indevida e aceite fabricado são negados.
- Teste de idempotência: clicar duas vezes gera **o mesmo** recibo, não cobrança duplicada.
- Teste de histórico: conteúdo e recibo publicados não podem sofrer UPDATE/DELETE silenciosos; novas versões não alteram aceites antigos.
- Teste de UI: termos disponíveis antes da compra e após a compra; informações completas de preço/cancelamento, sem checkbox pré-marcado; consentimentos opcionais independentes.
- Teste de mudança de versão: documento materialmente novo exige decisão e eventual reaceite adequado, sem bloquear clínica indevidamente em meio ao atendimento.
- Teste do suporte: canal publicado recebe pedido real de teste e gera protocolo sob acesso restrito.
- Teste de conveniência: fluxo mobile/desktop não abre contratos falsamente com `enabled=false` e não cria aceites em background.
- **Verificar planos e dados no backend**: não é seguro usar unicamente verificação em React antes de iniciar assinatura paga.

## Critérios objetivos de aceite da etapa 6

Documento aprovado por advogado e Prestadora; responsabilidade clínica definida; contato de privacidade ativo; DPA/suprimentos e transferência internacional avaliados; anexo de plano e beta real; versão publicada, QA de backend e UI, recibo imutável por representante, convite restrito e parada de novas vendas testada; retenção, incidente, suporte e telemetria sem PHI aprovados.

Se qualquer requisito material não for demonstrado, etapa 6 permanece `pending`, mesmo que a CI de minutas passe. **4/8 até as provas de conclusão.**
