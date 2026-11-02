# DentalFlow — motor de comprovantes de aceite de termos por versão (pré-beta)

**Revisão técnica: 02/11/2026. NÃO HÁ TERMOS APROVADOS NEM PUBLICAÇÃO A CLIENTES.**

Esta implementação tem três componentes versionados:

- `docs/saas/sql/saas-legal-versioned-acceptance-schema.sql`: esquema proposto, **executado só na base descartável da CI**, não aplicado ao Cloud ou Produção. Documentos por tipo e versão possuem corpo integral e hash SHA-256 verificado pelo próprio PostgreSQL; publicação exige referência de aprovação, usuário aprovador e datas. Publicações e recibos são imutáveis por trigger. RLS só permite a usuários autenticados ler documentos publicados; nenhuma gravação direta pública.
- `docs/saas/sql/saas-legal-versioned-acceptance-rehearsal.sql`: teste SQL transacional, com usuários de e-mail `.invalid`, duas clínicas fictícias e uma versão **fictícia** aprovada apenas dentro do ensaio. Verifica que um dono só pode assinar pela própria clínica, rejeita documento em rascunho, hash desatualizado, inserção arbitrária, falsificação de empresa e mutação de histórico. O comprovante repetido retorna o mesmo ID (idempotência). Todo dado de teste retorna por `ROLLBACK`.
- `src/lib/saas-legal-acceptance.ts`: cliente TypeScript para consulta dos documentos publicados e aceite da versão/hash por RPC. **Inerte por padrão**: exige `VITE_SAAS_LEGAL_ACCEPTANCE_ENABLED=true`, além do servidor com o esquema aprovado; não é chamado por cadastro, checkout ou tela atual. O servidor também valida o usuário, a empresa e a versão; uma flag de cliente isolada não concede acesso.

## O que está implementado e o que continua pendente

| Critério | Situação |
| --- | --- |
| Versionamento, corpo e digest do documento | Implementado como contrato SQL isolado |
| Acesso apenas a texto publicado | Teste de RLS descartável |
| Recibo por ator/clínica, hora do servidor e idempotência | Teste funcional descartável |
| Imutabilidade e bloqueio de aceite de outra clínica | Teste funcional descartável |
| UI visível ao responsável e aceite antes de contratação | **Não ativado**; depende de revisão de fluxo, conteúdo aprovado e implantação |
| Registro de valor do plano/contratação | **Ainda pendente**; não confundir catálogo de preços com acordo individual |
| Revisão por jurídico, conteúdo real e aprovação da prestadora | **Pendentes**, sem decisão jurídica presumida |
| Migração e publicação em Produção | **Não realizadas** por este PR |

**Segurança:** jamais usar um documento fictício do teste como texto vigente, nem habilitar o flag em Produção sem aprovação contratual/privacidade. A comprovação de assinatura ou revisão por advogado é externa à ferramenta, portanto não pode ser criada por CI. O gate `published-versioned-terms-acceptance` de 6.4 mantém status **pendente**.

O marco técnico separado `dormant-versioned-receipt-contract-verified`, se aprovado pela CI, demonstra apenas que a infraestrutura isolada da emissão de comprovantes está implementada e protegida, sem atribuir o resultado completo de 6.4.

A versão beta que trate pacientes reais exige avaliação jurídica e operação de incidentes/retention apropriadas; esta implementação não as substitui.
