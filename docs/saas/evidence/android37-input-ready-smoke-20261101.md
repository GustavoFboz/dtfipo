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
