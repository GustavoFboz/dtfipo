# Recuperação da criação clínica

Em 26/10/2026 foi confirmada a ausência de `create_patient_idempotent_v1` e
`create_case_idempotent_v1` no banco publicado. A UI já dependia dessas operações.
A migração completa o contrato; não há fallback para INSERT sem idempotência.

As duas operações rodam como o chamador (security invoker), sob as políticas
clínicas e de empresa existentes. Nenhum usuário de teste é promovido para
comprovar sucesso. O recibo de tentativa guarda somente ator, empresa, chave,
hash e IDs; a repetição lê novamente os resultados sob RLS. Acesso revogado ou
resultado excluído exige revisão, sem recriar o registro. Recebimentos, contratos,
estoque e pacientes históricos não são migrados nem reatribuídos.

Cada caso e seus vínculos, etapa inicial, uso da fresa ativa, atividade e
notificação pertencem à mesma transação. Dois cliques ou perda de resposta
reutilizam a chave estável. O identificador do caso também fica estável para o
Desktop retomar a outbox. O caminho legado de duas arcadas continua atômico; a
interface atual cadastra um caso unificado quando as duas arcadas são escolhidas.

O cadastro normal e o embutido mantêm a tentativa em sessão por identidade.
Após criar um paciente no formulário do caso, a UI usa o ID retornado diretamente;
não procura o primeiro paciente com o mesmo nome. Nomes iguais exigem CPF, RG
ou telefone que distinga o novo cadastro. Essa conferência também ocorre no
banco, com serialização por empresa/nome.

A edição só anuncia confirmação após uma linha ter sido atualizada. Revalidação
e hidratação das listas ocorrem em segundo plano após a confirmação, sem
aguardar a recarga geral do aplicativo para fechar o formulário. Uploads mantêm
o gerenciador e as reservas existentes. A janela offline continua limitada a 72h.

O ensaio `sql/clinical-creation-rehearsal.sql` usa identidades sintéticas somente
no banco descartável do CI, com rollback. Ele verifica repetição, mudança de
payload, nomes iguais, isolamento, rollback dos vínculos, etapas, fresa, edição,
arcadas legadas e resultado excluído. Não substitui logins reais nem aumenta
por si só os 23 aceites do SaaS.
