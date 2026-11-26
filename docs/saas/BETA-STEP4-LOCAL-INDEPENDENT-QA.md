# DentalFlow — Etapa 4: execução real de Auth/REST/Storage sem Lovable

**Implementação:** ensaio técnico com Supabase CLI completo, em PostgreSQL + Auth + REST + Storage rodando somente em GitHub Actions descartável.

## O que será verificado

- O workflow escreve um project ID exclusivo no diretório temporário; não importa o config.toml de produção nem usa .env, GitHub secrets, Asaas, Lovable ou outro projeto remoto.
- O teste permite somente http://127.0.0.1:54321; todas as outras origens são rejeitadas antes das chamadas.
- A estrutura já versionada do banco é restaurada em um Supabase local; duas contas fictícias são criadas através do Auth real e vinculadas a duas empresas fictícias de plano sandbox.
- Login real e dois contratos de criação idempotente: create_patient_idempotent_v1 e create_case_idempotent_v1. Prova abertura/edição de caso próprio e nega leitura, edição e reatribuição entre empresas.
- Dois arquivos 100% sintéticos são enviados ao Storage API local usando as reservas do aplicativo. O dono consegue baixar o mesmo conteúdo; o usuário da outra empresa não. O metadata case_attachments também é testado contra leitura e exclusão cruzadas.
- Somente um resumo agregado é exibido; nenhum JWT, chave, dado clínico ou nome é escrito em CI. O runner usa supabase stop --no-backup mesmo em caso de erro.

## Escopo e limites

Este ensaio usa os serviços reais Supabase Auth/REST/Storage, não mocks HTTP, mas não substitui a verificação da interface Web publicada. Também não comprova dispositivos Windows/Android, Live Asaas, histórico da IPO nem rollback da versão Web hospedada.

O contador +1/8 da etapa 4 somente será atualizado quando criação, abertura, edição e isolamento com duas contas estiverem realmente comprovados no staging **e** houver prova suficiente da interface Web sem regressão. Caso apenas o backend real passe, o status da etapa 4 permanece pendente e a evidência é incorporada à preparação.

A execução do teste não libera produção ou beta pago. Os 8 gates P0 permanecem independentes.

## Evidência

GitHub Actions — DentalFlow SaaS Beta 4 Local Real Auth Integration. Um resultado aprovado gera apenas um JSON agregado chamado dentalflow-beta4-local-real-http-aggregate.

Nenhum cadastramento no Lovable, pagamento ou ação do proprietário é necessário.
