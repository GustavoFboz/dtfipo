# Centro de atualizações nativo

O Centro de atualizações faz parte somente dos clientes instalados do DentalFlow:

- **Windows/Tauri:** exibe exclusivamente instaladores `*-setup.exe`.
- **Android/Capacitor:** exibe exclusivamente instaladores `.apk`.
- **Web/PWA:** o provider não resolve um runtime nativo e o botão retorna `null`; portanto o recurso não é renderizado.

## Fonte de verdade

Os arquivos permanentes e as notas ficam em **GitHub Releases** do repositório `GustavoFboz/dtfipo`. O cliente consulta a API pública de releases, filtra tags e assets por plataforma e mantém um catálogo local para funcionamento offline.

| Plataforma | Tag              | Instalador                               | Notas                            |
| ---------- | ---------------- | ---------------------------------------- | -------------------------------- |
| Windows    | `windows-vX.Y.Z` | `DentalFlow_Windows_X.Y.Z_x64-setup.exe` | `docs/releases/windows-X.Y.Z.md` |
| Android    | `android-vX.Y.Z` | `DentalFlow_Android_X.Y.Z.apk`           | `docs/releases/android-X.Y.Z.md` |

Artefatos comuns do GitHub Actions continuam disponíveis por 14 dias para diagnóstico. A release é o canal permanente consumido pelo aplicativo.

## Funcionamento no cliente

1. O runtime lê a versão realmente instalada pelo Tauri ou pelo Capacitor.
2. O catálogo é consultado no início, ao voltar para a janela e a cada 30 minutos em sessões longas.
3. Respostas são mantidas localmente por 15 minutos e servem como histórico offline.
4. Uma versão superior gera um ponto no ícone, um aviso dentro do app e uma notificação nativa única por versão.
5. O download é aberto no navegador do sistema. URLs que não pertençam a `github.com/GustavoFboz/dtfipo/releases/download/` são recusadas.
6. O histórico mostra somente arquivos compatíveis com o dispositivo atual.

## Publicar uma nova versão

### Windows

1. Atualize `version` em `src-tauri/tauri.conf.json` e `src-tauri/Cargo.toml`.
2. Crie `docs/releases/windows-X.Y.Z.md` com o bloco `dentalflow-update` no início.
3. Atualize as verificações de versão e abra o PR normalmente.
4. Após o merge na `main`, `desktop-windows.yml` compila, calcula SHA-256, cria/atualiza `windows-vX.Y.Z` e envia o instalador permanente.

### Android

1. Atualize `VERSION` e `versionCode` em `scripts/prepare-android-release.py`.
2. Crie `docs/releases/android-X.Y.Z.md` com o bloco `dentalflow-update` no início.
3. Atualize as verificações de versão e abra o PR normalmente.
4. Após o merge na `main`, `mobile-android.yml` testa o APK, calcula SHA-256, cria/atualiza `android-vX.Y.Z` e envia o instalador permanente.

Para manter a mesma identidade criptográfica entre APKs, configure os secrets:

- `DENTALFLOW_ANDROID_KEYSTORE_BASE64`: PKCS#12 em Base64, alias `dentalflow`.
- `DENTALFLOW_ANDROID_KEYSTORE_PASSWORD`: senha forte do PKCS#12 e da chave.

Sem esses secrets o workflow ainda produz um APK de pré-visualização instalável, mas o Android pode exigir desinstalação antes de uma versão assinada por outro certificado. O canal distribuído deve sempre usar a chave retida.

## Primeira adoção

As versões anteriores (`Windows 0.6.5` e `Android 0.2.1` ou inferior) não contêm esta interface, pois ambos os aplicativos embarcam o frontend dentro do instalador. É necessário instalar manualmente **Windows 0.6.6** e **Android 0.2.2** uma vez. A partir dessas versões, lançamentos futuros aparecem no próprio Centro de atualizações sem depender da versão web.
