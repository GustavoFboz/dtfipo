# Gate independente de beta comercial pago — DentalFlow

O objetivo autorizado pelo responsável é implantar **beta Web por convite e pago antes dos 23 aceites físicos/temporais**, que continuam integralmente no protocolo. A conclusão técnica e o beta comercial são trilhas distintas. O gate antigo `scripts/saas-sales-release-gate.mjs` continua vinculante para liberação comercial geral, não deve ser adulterado.

O novo gate **somente leitura** confere oito condições essenciais específicas de beta, definidas em `PAID-BETA-READINESS.json`. Todas começam pendentes. Rodar `node scripts/saas-paid-beta-pilot-gate.mjs` e `node --test scripts/saas-paid-beta-pilot-gate.test.mjs`. Teste de casos físicos e carga pode ficar no piloto; **backups recuperáveis, isolamento dos dados, termos reais, ciclo financeiro e reversão não podem**. No estágio atual o resultado esperado é `blocked`.

Uma evidência real por item deve ser citada e conferida independentemente. Simular uma lista `verified` num teste só mostra que a decisão passaria a **elegível para revisão manual**, nunca autorização de produção, cobrança ou publicação. O algoritmo não tem chamadas de rede nem acesso a secrets, Asaas ou banco. Nenhum status neste arquivo desbloqueia os checkouts existentes.

**Não publicar nem vender** sem resolver os pendentes; não declarar 100% técnico ou 23/23 com base neste gate. Usar branches isoladas, CI, backups completos e rollback exercitado. Relacionado a issue #241.
