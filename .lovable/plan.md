# Verificação somente leitura — capacidades de recuperação

## Verificado
- Sandbox do agente (terminal privado, sem superfície pública): `SUPABASE_URL`, chave administrativa de servidor e chave publicável estão presentes (valores não lidos).
- `scripts/operational-recovery.mjs` e `scripts/recovery/archive.mjs` existem no checkout.
- Disco temporário livre: cerca de 32 GB em /tmp (suficiente para partes de 8,4 GB, se transmitidas em sequência).

## Onde a rotina poderia rodar
- No terminal do sandbox, com `bun`/`node`, usando a chave de servidor do ambiente. Isso é diferente do código frontend com chave anônima: aqui as regras de acesso são ignoradas e nenhuma rota é criada.
- Limitações concretas: cada comando dura no máximo 600 s (rotina precisa ser retomável por partes); o sandbox é efêmero, então as partes criptografadas precisam ser gravadas de volta num bucket privado; não foi comprovado que a chave de servidor do sandbox pertence ao projeto publicado (não foi feita nenhuma chamada).

## Exportação nativa do banco
- Nenhuma ferramenta do agente aciona a exportação nativa. Ela só pode ser iniciada pelo titular em Cloud → Database → Manage → Settings → Export data (1 por 24 h; backend precisa estar ativo).

## Próximo passo (se aprovado)
Fazer um único teste somente leitura: listar 1 bucket privado com a chave de servidor para comprovar acesso, sem baixar nenhum objeto.
