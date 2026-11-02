# Checklist de trabalho executável sem Work — Protocolo SaaS

Checkpoint 01/11/2026. Símbolos: `[x]` desenvolvido nesta PR ou previamente e testado; `[ ]` ainda não comprovado. **Verde apenas após CI/merge.** Revisões de fornecedores e beta testers continuam separadas.

## Entregas desta rodada: 0/6 antes da integração

- [x] (1/1) Reclassificação técnica proposta: 23 critérios mantidos, 20 gates estritamente externos adiados da fórmula, sem apagar nenhum aceite.
- [x] (1/1) Novo motor de cálculo para implementação beta, com lista fixa de exclusões e proibição de mover backup/legado/termos para beta.
- [x] (1/1) Painel Master preparado para indicar UM percentual de implementação e continuar mostrando que a venda não está autorizada.
- [x] (1/1) Testes de regressão e CI configurados para recusar alteração fraudulenta de marcos e liberar vendas.
- [x] (1/1) Relatório agregado atual dos 12 pacientes sem clínica: sem identificadores/PHI e com histórico de criação e vínculo a casos.
- [x] (1/1) SQL somente leitura para repetir o relatório e verificar se registros órfãos continuam surgindo.

`[x]` acima indica presença de código/documentação na PR. **Não significa CI aprovada ou deploy publicado**. A conferência de integração deve citar a PR e testes concluídos.

## Implementação obrigatória restante antes de considerar 100% técnico: 0/5 frentes completas

- [ ] (4.2 — 0/1) Resolver com evidências a procedência dos 12 cadastros históricos, sem alteração ou exclusão por suposição.
- [ ] (6.2 — 0/3) Recuperar 116 objetos históricos, validar restauração bytes+banco e conciliar delta atual do Cloud.
- [ ] (6.3 — 0/1) Medir Web, banco e Realtime em staging isolado com baseline de recursos; testes de carga reais ficam para piloto.
- [ ] (6.4 — 0/1) Implementar e provar aceite por versão do texto final de termos aprovado por jurídico; não publicar minutas.
- [ ] (7.4 — 0/1) Gerar candidato de release versionado, integridade/paridade entre plataformas e rollback testado.

## Validações externas adiadas do indicador — pendem da fase beta e autorizações

- 20 gates fixos em `BETA-IMPLEMENTATION-SCOPE.json`, incluem dispositivos físicos, períodos reais de cobrança, vigência do downgrade, piloto/autenticação real e pareceres jurídicos.
- **Beta com dados clínicos reais não começa antes das aprovações jurídicas e da avaliação de backup, identidade e recuperação.** Beta fechado sintético também precisa de autorização operacional.
- Lançamento público/comercial continua bloqueado em `scripts/saas-sales-release-gate.mjs`; atingir 100% de implementação não cria autorização ou cobrança.

## Proveniência da medição

`scripts/saas-beta-implementation-progress.mjs` lê `IMPLEMENTATION-PROGRESS.json` (historicamente auditável) e `BETA-IMPLEMENTATION-SCOPE.json`, sem editar os 23 aceites.
`scripts/sync-saas-dashboard-progress.mjs` gera o único indicador do Master. O salto de 78,80% para 93,48% é **mudança de escopo do indicador, não entrega de 14,68 pontos de código**.
