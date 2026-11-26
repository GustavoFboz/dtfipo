# Publicação de arquivos privados — 05/10/2026 em Manaus

A PR [145](https://github.com/GustavoFboz/dtfipo/pull/145) integrou referências renováveis, leitura por sessão e espelho de imagens instalado com o teto offline existente. Candidato `bb10b8d5d8fd93460930e6508b909076f50b9c2f`, merge `d03617875db107a8e4e65906257913b42fa3d8e9`.

384 testes em 21 arquivos, TypeScript e builds Web/Desktop/Mobile passaram. CI 37397051506 e restores 37397051686/37397056169 passaram no candidato. CI 37397200303 e restore 37397200378 passaram no merge. Não foram gerados novos instaladores nem feitos testes em aparelho.

Publicação solicitada com deployment `803b1b3d-537b-43f9-8667-3df77bde44cd`. GET público do Master (request 65) retornou HTTP 200, sem timeout, e anunciou o asset `api-D_uFKFMO.js`. A leitura desse asset (request 67) retornou HTTP 200 e apontou `private-file-access-L0-VndHU.js`. A leitura do helper (request 68) retornou HTTP 200 e confirmou referência Storage, assinatura de 300 segundos, guarda de sessão/recusa/expiração e namespace de imagens por conta. Esta inspeção foi feita às 01h08 UTC, 21h08 de Manaus. `response_record_created_at` é a data do registro pg_net, não a hora comprovada de conclusão HTTP. O fluxo autenticado de usuário não foi exercitado.

Os hashes do ledger e das assinaturas estabelecidas coincidiram entre 00h58 e 01h05 UTC. A definição exclui metadata/updated_at das assinaturas para evitar que consultas de reconciliação alterem o comparador. Este incremento não chamou Asaas, replay, criação de cobrança ou remoção/renomeação de arquivo clínico. Produção continuou com zero pagamentos registrados. Sandbox continuou com cinco eventos processados, dois dead letters e zero conclusões auditadas dos testes externos.

A consulta anterior encontrou 32 referências antigas de fotos e seis de avatares. O novo renderer deixa de utilizar esses tokens, mas não revoga cópias previamente emitidas. Tratamento histórico, leitura de avatar entre empresas, autenticação/recuperação de fixtures e provas de fluxos continuam pendentes.

**Meta solicitada: 10/23. Aceites comprovados após a publicação: 2/23 (8,70%). Nenhum aceite integral foi acrescentado por compilação ou inspeção estática.** As duas revisões requerem a sessão Master/AAL2 do titular; o acesso técnico não substitui essa confirmação. O plano [TARGET-10-OF-23.md](../TARGET-10-OF-23.md) define as oito provas adicionais necessárias.

Recibo estruturado: [private-file-release-20261006.json](private-file-release-20261006.json). Contrato de execução: [PRIVATE-FILE-ACCESS.md](../PRIVATE-FILE-ACCESS.md).
