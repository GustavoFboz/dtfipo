# DentalFlow — pré-verificação do pacote beta (sem publicação)

**Estado em 02/11/2026:** ferramenta de engenharia, não um release autorizado. O script `scripts/saas-beta-release-preflight.mjs` gera inventário local somente leitura, incluindo commit de origem, versão Web/Windows/Android, hashes SHA-256 de arquivos-chave e de todas as migrações SQL, além de bloqueios de backup, termos, assinatura e reversão.

## Executar no diretório do projeto

```bash
node scripts/saas-beta-release-preflight.mjs
node --test scripts/saas-beta-release-preflight.test.mjs
```

O script **não faz deploy, não publica APK/EXE, não muda assinatura, não executa SQL no Cloud, não toca em prontuário e não cria cobrança**. Os itens `release_authorized` e `preflight_status` serão sempre `false` / `blocked` nesta fase. Sua saída nunca inclui conteúdo ou chave de paciente.

Se um candidato de reversão for indicado via `DENTALFLOW_ROLLBACK_CANDIDATE`, ele deve ter 40 caracteres hexadecimais e diferir da revisão atual. Isso **apenas registra** a escolha; não testa nem executa rollback. A versão desktop deve ser idêntica entre Tauri e Cargo; o pacote Android e a versão precisam ser consistentes. Todos os caminhos de artefato são restringidos ao diretório `release/`, sem substituição nem publicação automática.

## O que ainda falta para o gate 7.4 ficar inteiramente comprovado

- Criação dos artefatos de lançamento final, verificação da assinatura de código Windows/APK e SHA de cada instalador; smoke em ambientes e aparelhos autorizados.
- Confirmar a revisão do backend/migrações publicada exatamente com o cliente, não apenas a mesma branch GitHub.
- Confirmar um backup **completo**, incluindo 116 objetos ainda ausentes do inventário histórico, e seu teste de restauração.
- Exercitar procedimento de retorno e sua integridade em staging, com evidência de tempo de recuperação.
- Aprovar textos jurídicos, escopo de piloto e decisão comercial conforme responsável; o mecanismo nunca deve substituir essas decisões.

**O que comprova este pré-ensaio:** que existe um bloqueador reprodutível para versões incompatíveis, arquivos de origem inesperados e tentativas de simular aprovação; um inventário de integridade pode ser gerado a partir do mesmo commit. **Não comprova** uma versão final assinada nem preparação completa para beta com dados clínicos reais.

Para o indicador único de implementação, este pré-ensaio é um marco técnico **adicional e parcial** dentro de 7.4. O gate original `production-release-candidate-verified` continua explicitamente aberto.
