# Android 0.2.1 — inicialização e recuperação

Relato: Moto G56, Android 17 informado pelo usuário, APK 0.2.0. O login
aparece por cerca de um segundo e o Android informa falhas contínuas.
Diagnóstico e entrega não dependem de USB.

## Evidências

- O teste antigo aceitava `am start -W` com `Status: timeout`, porque o comando
  retornava zero e havia um processo vivo. Isso não demonstrava abertura válida.
- A primeira execução instrumentada sofreu sobrecarga geral do emulador, com
  ANRs de serviços do Android. Exigir acesso a KVM eliminou esse problema inicial.
- Na execução `34762528728`, a 0.2.0 abriu e manteve seu processo, mas registrou
  React #418. A execução de diagnóstico `34763109353` mostrou a divergência exata:
  a árvore de login entrava onde a página pré-gerada ainda tinha Suspense.
- A alteração de hidratação passou na execução `34763452456`, job
  `103740166755`: login renderizado, alternância login/cadastro, retorno do
  segundo plano e ausência da exceção JavaScript observada na versão anterior.
- A exceção JavaScript reproduzida **não comprova a causa do encerramento nativo
  específico do Moto**. O Android 17 do emulador também apresentou falhas do
  próprio sistema gráfico (`hasReadColorBufferDma`), separadas das falhas do app.

## Alterações

O build móvel aguarda a hidratação antes de montar a interface e os plugins.
Isso preserva as rotas, os adapters local-first, a identidade Cloud, os caches
isolados por usuário e as operações de casos, clínica, estoque e impressão.
Web e Windows mantêm a montagem anterior.

Um ponto de entrada nativo oferece recuperação quando a abertura anterior
falhou. Exceções Java preservam o tratamento original do Android e deixam um
relatório local limitado. A tela pode compartilhar esse relatório por ação do
usuário. O relatório contém versão, modelo, Android e classes/frames da falha;
não contém mensagens da exceção, tokens, banco ou dados clínicos. Falhas do
renderizador WebView descartam a instância encerrada e abrem a recuperação,
sem repetição automática ilimitada nem limpeza de dados.

## Instalação e assinatura

Os APKs anteriores eram assinados com uma chave de debug gerada a cada runner.
Certificados observados:

- APK 0.2.0 entregue: `c483fd38a31c765810cc696a55f1e80bf6a2c57c2601573b943a7d32a352e3ea`.
- Nova compilação do mesmo código: `f49b51b4fb088fb45d931584128cbf864b52fba2a71ad5f0f65b9e16e1d34c1e`.

Sem a chave original, não é possível atualizar aquela instalação mantendo o
mesmo identificador e certificado. A entrega 0.2.1 usa instalação paralela
`br.com.dentalflow.mobile.preview`, rótulo **DentalFlow 0.2.1**, versionCode 3.
O aplicativo anterior permanece instalado com seu armazenamento intacto.
O usuário entra normalmente na conta; dados apenas locais do aplicativo antigo
não são migrados silenciosamente. Não orientar desinstalação ou limpeza de dados.

O pacote gerado pelo CI é um insumo de teste. A entrega deve ser assinada com a
chave privada retida, usando `scripts/sign-android-apk.sh`. A chave nunca deve
ser commitada. Próximas atualizações desse pacote precisam usar a mesma chave.
O pacote principal `br.com.dentalflow.mobile` continua disponível no preparador
quando `DENTALFLOW_ANDROID_PARALLEL` não está ativado; não usá-lo como atualização
do APK antigo sem recuperar a assinatura correspondente.

## Validação e limites

O CI exige abertura confirmada, continuidade do processo, interação com a
WebView real, ausência de erros JavaScript e recuperação de exceção provocada.
Também instala e exercita o build release sem depuração. Logs de falha provocada
são separados dos logs de inicialização limpa. Falha do emulador não deve ser
rotulada como aprovação do dispositivo.

As verificações existentes de regressão Android e dos adapters locais/privacidade
Windows passaram. O login em uma conta real, as operações autenticadas completas
e o comportamento no Moto físico não foram confirmados; não declarar validação
integral apenas a partir dos testes de abertura.

Referências: [React #418](https://react.dev/errors/418),
[TanStack SPA](https://tanstack.com/start/latest/docs/framework/react/guide/spa-mode),
[Android emulator runner](https://github.com/ReactiveCircus/android-emulator-runner).
