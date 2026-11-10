# DentalFlow — Aviso de Cookies, Sessões e Telemetria

**MINUTA NÃO APROVADA/NÃO PUBLICADA, v0.1, 10/11/2026.** Ainda não existe inventário auditado de cookies, tags e SDKs na versão hospedada final. Não publicar uma “política de cookies definitiva” nem implementar banner decorativo sem conferir o tráfego.

## 1. Finalidades necessárias

A aplicação poderá usar identificadores de autenticação, memória de sessão, preferências de segurança, configuração de empresa e recursos estritamente necessários ao uso e à prevenção de fraude. É preciso confirmar para cada tecnologia: nome, domínio, fornecedor, categoria, duração, armazenamento/cookie, dados coletados, base legal, destinação e eventual transferência internacional.

## 2. Itens que exigem decisão específica

- **Analytics e publicidade:** não presumir uso, ausência ou base legal. Caso existam, separar finalidade, permitir recusa eficaz quando exigida e impedir funcionamento antes da escolha quando necessário.
- **Telemetria de erros:** manter apenas códigos técnicos, versão do app, plataforma e evento sanitizado; não coletar payloads clínicos, nomes, fotos, STL, chat, URLs assinadas, credenciais ou tokens; restringir acesso e definir retenção.
- **Push/e-mail:** diferenciar notificações operacionais e mensagens de marketing. Verificar escolhas legítimas e funcionamento de opt-out quando aplicável.
- **SDKs de terceiros:** observar requisições Web, WebView, Windows/Android e serviços de backend; fornecedores reais e países podem diferir por plataforma.

## 3. Experiência do usuário

Se houver cookies/tags **não essenciais** que exijam consentimento, o controle deve permitir escolha granular e recusa tão acessível quanto aceitação, com alteração posterior, prova de versão/finalidade e nenhuma ativação prévia. Não usar checkbox de “aceito todos os Termos” como consentimento generalizado para cookies de marketing ou dado sensível. Tecnologias estritamente necessárias podem ter outra hipótese legal, desde que o aviso seja claro e proporcional.

## 4. Auditoria antes de publicação

Criar inventário com navegação anônima, login de profissional e checkout sandbox, observando DOM, storage, cookies, analytics, Network e plataformas; usar **somente contas fictícias** e não capturar credenciais/saúde no relatório. Mapear todos os terceiros e validar contrato de suboperador e transferência internacional, quando aplicável. Registrar hash da build hospedada e resultado de aceitar/recusar/alterar escolha.

**Status:** `PENDENTE`, proprietário técnico `[PENDENTE]`, aprovação jurídica `[PENDENTE]`. Nenhuma finalidade de rastreamento real foi aprovada por este rascunho.

Referência: [Guia Orientativo — Cookies e Proteção de Dados Pessoais da ANPD](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/anonimizado___guia_de_cookies.pdf).
