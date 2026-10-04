# Continuidade 3/7–5/7 em 04/10/2026

Base remota: `591f3ca736186a2e8f54283ca05adc7cb9ba61e5`.
Preservadas as inspeções do Lovable e a regeneração de tipos após PR 122.

## Correções implementadas

- Foto e avatar recusam resposta de assinatura vazia antes de salvar/concluir.
- Foto, avatar, anexo de paciente e anexo de caso usam a mesma regra de rollback:
  só cancelar a reserva depois de Storage confirmar a remoção do objeto.
  Falha de remoção é propagada e conserva a reserva para recuperação auditada.
- Transporte servidor de alteração Asaas via PUT, limitado a preço, data e
  INACTIVE, preserva cobranças existentes e não repete escritas inconclusivas.
  Ainda não há chamada pela fila: não houve operação Asaas nesta rodada.

## Inspeção somente leitura do backend ativo

A inspeção inicial encontrou `can_access_case` com staff/admin global e políticas
permissivas antigas. A migração `20261005062000` restringe o helper por empresa ou
participação explícita aprovada e adiciona políticas restritivas a casos, anexos
e objetos privados. O guard de escrita verifica NEW: um participante externo
não pode forjar requester/paciente/atribuições nem aprovar uma própria solicitação.
Casos sem requester usam a empresa do paciente antes da empresa do profissional
atribuído. A alteração não modifica registros clínicos. O ensaio de restore
cobre staff de empresa alheia, criação de participação falsa, aprovação e remoção
legítimas e a tentativa do especialista de substituir requester/atribuição.
A migração precisa passar pelo CI antes de aplicação viva; não encerrar 4/7
somente com essas políticas.

Contagem agregada: 65 casos, 39 sem requester, nenhum proprietário não resolvido,
nenhuma diferença entre proprietário resolvido do caso e do paciente. Portanto
não assumir que requester é sempre preenchido ao projetar a correção de ownership.
Nenhum dado clínico foi alterado durante esta inspeção.

Ainda faltam a política global Auth comprovada com sessões reais de fixtures,
a revisão dos links privados antigos de foto/avatar e testes HTTP e em apps
instalados. Tipos gerados não representam prova de permissões do banco.

## Aceites e contador

Permanecem **7 de 7 etapas com aceites abertos**, com trabalho ativo em 3/7, 4/7 e
5/7. 6/7 e 7/7 adiadas pelo responsável. DICOM permanece fora desta rodada.
Testes locais não comprovam upload físico, MFA real, execução Asaas ou revisão
servida no endereço publicado. Nenhuma cobrança ou cancelamento foi executado.

Fonte primária de transporte:
https://docs.asaas.com/reference/atualizar-assinatura-existente

## Validação local

232 testes em 16 arquivos passaram; TypeScript e build Web passaram, assim como
checks 06/08/09 e regressão de entitlement/bootstrap Desktop. Dez testes novos
cobrem cleanup, 18 cobrem o transporte de alteração Asaas. Restore determinístico
regenerado com 169 migrações. A prova SQL entre empresas depende do CI descartável.
