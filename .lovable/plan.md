# Inspeção somente leitura — continuidade SaaS 3/7–5/7

## Evidência obtida
- O GET privado do diagnóstico no site publicado retornou **HTTP 200**, `available=true`, contrato `dentalflow-worker-health-v1`, ambiente `sandbox`. A consulta usou a credencial já presente sem exibi-la; o parâmetro `dryRun=true` foi enviado, mas a implementação do GET não o reconhece nem o devolve. O GET apenas lê telemetria e não chama o provedor.
- O mesmo endpoint sem credencial retornou **HTTP 401**.
- A resposta sanitizada **não inclui revisão/commit**. Portanto, este diagnóstico comprova o contrato servido e a leitura da telemetria, **não** comprova que a revisão `7e64d677827af89ab0b5628644260ac483412737` está servida. Não usar `is_published` como substituto.
- A leitura de `/auth/v1/settings` retornou **HTTP 200**, mas **não expõe `password_min_length`**. A ferramenta disponível para configurar Auth é de escrita, não fornece leitura da configuração atual nem parâmetro para definir esse mínimo; não foi chamada. O mínimo ativo global continua **não verificável com estas capacidades**. O mínimo de oito caracteres documentado na aplicação não comprova política global.

## Capacidades e limites para próximos aceites, sem executá-los nesta inspeção
- É possível fazer testes HTTP com ferramentas de requisição e testes de interface em navegador isolado, além de SELECTs e inspeção das respostas sanitizadas. Isso não cria uma conta fictícia nem comprova MFA real por si só.
- Prova HTTP com conta fictícia e MFA isolado requer uma identidade de teste criada/autorizada, sessão de teste e um autenticador próprio, nunca a conta ou autenticador de Gustavo. Criar conta, registrar fator ou alterar Auth estão fora do escopo somente leitura e não foram feitos.
- Para atestar o hash publicado será necessária uma evidência que vincule explicitamente a resposta do site à revisão (por exemplo, um identificador de revisão exposto por diagnóstico aprovado ou um recibo verificável de publicação). O diagnóstico existente não oferece esse vínculo; nenhuma alteração será feita nesta inspeção.

Nenhuma operação Asaas, alteração de dados, secrets, Auth ou publicação. Homologação financeira em standby; Produção/dinheiro real e DICOM excluídos.
