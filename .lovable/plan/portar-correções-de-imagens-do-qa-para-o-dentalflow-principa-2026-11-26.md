# Portar correções de imagens do QA para o DentalFlow principal

## Situação verificada
- Principal: HEAD `494cc868` (igual ao commit-base informado), sem alterações locais.
- QA: snapshot `269091ef`. Backend diferente: QA usa outro projeto Cloud (`cfmr…`), principal usa `bbyh…`. Os `.env`, `supabase/config.toml`, `types.ts` e clientes gerados diferem e **não devem ser copiados**.
- O gancho `src/hooks/use-private-file-url.ts` (URL assinada, renovação, retry) e `src/lib/private-file-reference` são idênticos nos dois. As correções do QA estão nos componentes que o usam.

## O que portar (somente trechos, nunca arquivo inteiro sem revisão)
1. `src/components/ImageEditorDialog.tsx` (~290 linhas): prévia imediata no recorte; contador de versão contra corridas/fechamento/desmontagem; não reaproveitar imagem/anotações do arquivo anterior; erro visível se a imagem não decodificar; revogação do object URL.
2. `src/components/Lightbox.tsx`: estado de falha por URL, mensagem acessível de erro, índice seguro quando a lista muda.
3. `src/components/CaseAttachments.tsx`: remover cache local de URLs assinadas (passa a usar referência privada + gancho), botão "Visualizar imagem" na galeria com proteção para envio pendente.
4. `src/components/CaseComments.tsx`: remover `signedUrls`/`getCaseAttachmentUrl`; imagens via `privateFileReference`; manter prévias locais (blob) do envio.
5. `src/components/PatientAttachments.tsx`: miniaturas clicáveis abrindo o Lightbox.
6. `src/components/PatientCasePopover.tsx`: `<img>` → `PrivateImage`.
7. Testes novos do QA: `ImageEditorDialog.test.tsx`, `Lightbox.test.tsx`, `PatientAttachments.test.tsx`, `src/hooks/use-private-file-url.test.tsx`.

## O que NÃO portar (o principal está mais novo ou é específico de ambiente)
- `NewCaseDialog.tsx`: o QA reintroduz o preenchimento antigo do protético responsável; o principal resolve pelo diretório. Manter o principal.
- `DesktopRealtimeSync.tsx` (+ seu teste): mudança no import da recuperação de sessão Desktop; só portar se o principal não exportar essa função do cliente — a decidir após conferência, pois afeta o Desktop.
- `src/lib/lovable-error-reporting.ts`: o QA não tem a telemetria beta sanitizada que o principal tem; manter o principal e seu teste.
- `src/integrations/supabase/*`, `cron-auth.ts`, `.env`, `supabase/`, migrations, scripts de recuperação/SaaS só no principal, `package.json` (QA usa `vite-tanstack-config` 2.27.1; não atualizar nesta portabilidade).

## Riscos
- `CaseComments`/`CaseAttachments` têm lógica de envio offline/pendente: preservar `guardPending`, prévias blob e outbox.
- Desktop/APK: `PrivateImage` precisa continuar resolvendo arquivos em cache local; revisar o caminho Desktop do gancho antes do merge.
- Nenhum arquivo privado passa a ter URL pública; URLs assinadas continuam de curta duração e sem log.

## Validação
- Rodar os 4 testes novos + `global-search`, checks Desktop offline (`check-desktop-case-dialog-offline.mjs`), stage-06/stage-09, billing e entitlement Desktop.
- Typecheck e build pela plataforma; teste manual com conta fictícia: foto de paciente, anexo de caso, comentário com imagem, lightbox e recorte, incluindo troca rápida de arquivo e fechamento durante carregamento.
- Não publicar; aceite em Desktop/APK físico fica separado.
