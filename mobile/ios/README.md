# DentalFlow iOS 0.1.0 — primeira entrega (login-first)

Esta implementação reutiliza o front mobile oficial DentalFlow e o shell Capacitor 7. A base é saas/stage-03-asaas-checkout; Cloud, Asaas, dados de clientes e Produção permanecem intactos.

## Implementado

- Login real e-mail/senha pelo mesmo supabase.auth.signInWithPassword do app existente. Nenhum usuário fictício nem sucesso simulado.
- Preservados o fluxo de sessão do Supabase, a navegação autenticada e a separação de contas.
- Mensagens na tela para rede indisponível, credencial incorreta, limite de requisições ou backend não configurado.
- Layout iOS com notch / Dynamic Island / áreas seguras, telas pequenas, iPad, paisagem e teclado com rolagem.
- Android permanece com os mesmos plugins e canais de notificações.
- CI em macOS: build do app para Simulator e fonte do projeto Xcode; sem segredos Apple e sem publicação.

## Geração no Mac (Xcode 16+ e CocoaPods)

1. Faça checkout da branch mobile/ios-0.1.0-login-20261116.
2. Execute: bun install --frozen-lockfile
3. Execute: bun add --dev @capacitor/ios@$(node -p "require('./node_modules/@capacitor/core/package.json').version")
4. Execute: bun run build:mobile
5. Execute: bunx cap add ios (na primeira vez) e bunx cap sync ios
6. Abra ios/App/App.xcworkspace pelo Xcode e execute no Simulator.

O workflow .github/workflows/mobile-ios.yml realiza build no runner macOS, cria DentalFlow_iOS_0.1.0_Simulator.zip e DentalFlow_iOS_0.1.0_Xcode.tar.gz, com hashes SHA-256. O pacote de Simulator não pode ser instalado diretamente em iPhone físico.

## Dependência Cloud atualmente bloqueada

A tela de login pode abrir independentemente do banco, mas não é possível autenticar um usuário verdadeiro enquanto o Cloud Login estiver indisponível. A tentativa se encerra com mensagem clara e botão para tentar novamente. O backend e o processo de cobrança não são alterados.

## Pendências de homologação / publicação

- Login e logout reais, renovação de sessão e controle de conta após restabelecer a autenticação.
- Validação visual/acessibilidade em iPhone SE, modelos recentes e iPad; teclado, VoiceOver, autofill e modo escuro.
- Provisionamento offline cifrado, isolamento de dados clínicos e direitos de acesso no iOS. O runtime de dados offline desta base segue restrito a Android nesta primeira entrega.
- Implementação de plugins iOS ainda exclusivos de Android, incluindo impressão, notificações e demais recursos usados nas telas clínicas.
- Redefinição de senha/convites por universal links HTTPS: redirects capacitor://localhost não são links de e-mail externos válidos.
- Revisão de permissões, LGPD, privacidade, ícone e metadados de loja.
- Apple Developer Program, assinatura, Bundle ID definitivo, TestFlight, homologação e distribuição pela App Store.

## Critério de aceite

CI verde significa que a aplicação foi compilada para o Simulator. Isso não prova login real, execução em iPhone físico, nem aprovação Apple. Esses aceites ficam pendentes até testes verificáveis.
