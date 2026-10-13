# Arquivos privados: referências, renovação e cache por conta

Incremento de 05/10/2026, horário de Manaus, preparado na frente 4/7, item 4.3.
Não encerra o aceite integral de arquivos privados nem os testes em aparelhos.

## Comportamento implementado

- Uploads de foto do paciente, avatar e anexo de paciente guardam
  `storage://bucket/caminho`, sem token de leitura persistente. O upload ainda
  confere uma assinatura curta antes de concluir a reserva e conserva a ordem
  de rollback: remover o objeto, confirmar a remoção, liberar a reserva.
- Imagens e abertura de anexos convertem também URLs legadas do backend atual
  em referências. Pedem uma assinatura de cinco minutos usando o cliente
  autenticado e as políticas de Storage. Permissão recusada não recupera o link
  antigo. Outro projeto, caminho inválido ou resposta para outro objeto são
  recusados. Não existe mudança nas permissões do banco neste incremento.
- A assinatura em memória tem dono, geração de sessão e caminho. Troca de
  conta/logout limpam o resultado, e uma resposta tardia não aparece em outra
  sessão. Imagens em tela renovam antes do vencimento; o download da galeria
  também confere a sessão antes de salvar bytes.
- O helper de fotos por caso devolve referências, depois de verificar os casos
  visíveis, em vez de devolver o token de dez anos que estava na tabela.
- Web e aplicativos usam os mesmos componentes e contratos. No cliente
  instalado, imagens raster de até 2 MiB podem ganhar espelho local de bytes
  por conta, sem token: até 40 imagens e 20 MiB de representação armazenada.
  Imagens de casos já baixadas no cache instalado continuam disponíveis por
  esse adapter, com URL temporária liberada ao desmontar/renovar a visualização.
- A leitura offline exige identidade de dispositivo do mesmo usuário ainda
  válida, com teto de 72 horas. Nunca renova o prazo. O namespace participa da
  limpeza geral da conta. Sem cópia local, o arquivo continua exigindo rede;
  este pacote não implementa distribuição nativa nem cache de todos os arquivos.

## Evidência e pendências

Consulta somente leitura em 06/10/2026, 00h49 UTC (05/10, 20h49 Manaus):
seis buckets existentes privados, 32 referências assinadas de fotos de
pacientes, seis de avatares, nenhum anexo de paciente com URL assinada.
Às 00h51 UTC, nenhuma das 32 fotos tinha caminho de outro paciente, e nenhuma
foto usava outro formato. Não houve renomeação, exclusão ou alteração dos
objetos, metadados, reservas, perfis ou pacientes no banco vivo.

**Referenciar e deixar de reutilizar um token antigo não revoga cópias do token
que já foram emitidas.** O tratamento/revogação das 38 referências históricas,
a revisão da leitura de avatares entre empresas e a prova autenticada de
leitura/recusa/renovação na versão publicada seguem abertos. Não registrar
4.3 como concluído por compilação, mocks ou pela configuração privada do bucket.

384 testes em 21 arquivos passaram nesta revisão: assinatura, mudança de conta,
recusa sem fallback, expiração, cache instalado, armazenamento, billing,
identidade/MFA/Master e direito de uso Desktop. TypeScript, build Web, gates
06/09, restore determinístico de 172 migrations e bootstrap Desktop passaram.
São provas de regressão; os aceites de execução real permanecem separados.

Referências: [progresso](ACCEPTANCE-PROGRESS.md),
[prazo offline](OFFLINE-72-HOURS.md), [meta de dez aceites](TARGET-10-OF-23.md).
