# Android 37 — correção do ensaio de inicialização do emulador

Data: 01/11/2026. **Tentativa de corrigir a infraestrutura de CI; não é homologação Android 17/aparelho físico.**

## Falha observada

O workflow Android [41276846157](https://github.com/GustavoFboz/dtfipo/actions/runs/41276846157) terminou globalmente como success porque a matriz experimental tem `continue-on-error`. Porém o job Android `37.0/google_apis` falhou em `Smoke-test installed Android app`. O log tinha:

- `sys.boot_completed=1`, cerca de 50 segundos após iniciar o emulador.
- Logo depois `adb shell input keyevent 82` falhou com `cmd: Failure calling service input: Broken pipe (32)`, status 224.
- A rotina `scripts/smoke-test-android.sh` nunca foi executada.

A compilação do APK passou. Não atribuir falha de startup ao DentalFlow nem declarar compatibilidade sem executar o smoke.

## Modificação isolada

API35 mantém `reactivecircus/android-emulator-runner@v2` e script original. API37 passa a usar `scripts/smoke-test-android-api37.sh`: instala a imagem `android-37.0/google_apis/x86_64`, cria AVD descartável e aguarda boot, serviço de entrada e sucesso da tecla 82 com no máximo 90 tentativas; só então roda **o smoke original, sem enfraquecer seus testes**. Falha de boot/serviço/app continua devolvendo status não zero. O emulador é terminado e logs de erro são preservados para diagnóstico. A matriz 37 continua experimental, de modo que a aprovação exige olhar o **job**, não só o status global.

A ferramenta usa emulador sem Auth real, dados clínicos ou Asaas. Não publica APK, não muda certificado, versão, plano, banco, backups ou lançamento. Se passar, comprovará apenas instalação/inicialização em Android 37 emulador; dispositivo físico, offline 72h e Storage continuam separados nos itens 2.3/3.3.

## Resultado final — 01/11/2026

A [PR225](https://github.com/GustavoFboz/dtfipo/pull/225) foi integrada após a execução [GitHub Actions 41330255173](https://github.com/GustavoFboz/dtfipo/actions/runs/41330255173). **A matriz inteira terminou com success e, desta vez, ambos os jobs individualmente passaram**: Android API35 (`default`) e Android API37.0 (`google_apis`). O passo `Smoke-test installed Android app (API 37 with input-ready retry)` foi executado e terminou **success**, sem retorno antecipado do launcher. CI geral e restauração isolada também passaram.

As duas falhas intermediárias de infraestrutura diagnosticadas foram o `adb input` cedo demais e a criação/arquivo `.ini` do AVD com delimitadores incorretos. O script corrigido cria AVD com caminho único, confere a descoberta e espera entrada responsiva antes de iniciar o smoke real.

**Escopo aprovado:** compilação e inicialização em emuladores API35/API37. **Não aprovado:** testes de dispositivo físico, assinatura/publicação permanente do APK, reautenticação/suspensão reais, expiração offline de 72 horas e sincronização de anexos. O critério 2.3 permanece parcial, sem alteração dos 13 aceites finais.
