# SaaS 4.2 — Ensaio SQL de isolamento de pacientes entre empresas

**Data:** 01/11/2026. **Escopo:** banco PostgreSQL de restauração descartável, sem dados reais e sem credenciais de usuário/Asaas. **Não é homologação de sessão Auth real ou MFA.**

## Objetivo

Os testes externos de 4.2 com dois JWTs reais ainda precisam de dois pacientes controlados em QA. As clínicas de teste atualmente estavam vazias, logo `SELECT` negativo isolado era inconclusivo.

A restauração SQL já gera dados fictícios; adicionamos o ensaio `docs/saas/sql/patient-company-rls-disposable-rehearsal.sql` ao workflow de restauração, para detectar regressões de RLS em um banco PostgreSQL de fato, sem usar a produção.

## Provas projetadas

1. Insere dois usuários e empresas sintéticas, com associação CEO e assinatura operacional fictícia. Cria um paciente fictício para **cada** empresa, como administrador do banco descartável.
2. Assume o papel SQL **authenticated** com JWT claims simulados do ator A. Verifica que A consegue ler o próprio paciente (controle positivo) e não consegue selecionar, atualizar ou excluir o paciente B (controles negativos).
3. Recusa a inserção com clinic_id explicitamente de B, confirma que `clinic_id=NULL` é preenchido pelo guard com A — não se torna paciente órfão — e recusa alterar o clinic_id do próprio paciente para B.
4. Exige que a RPC `create_patient_idempotent_v1` não aceite uma empresa estrangeira fornecida pelo cliente.
5. Repete leitura própria, recusa de leitura/atualização/exclusão cruzadas na identidade B.
6. Encerra com `ROLLBACK`. Não modifica registros externos, conta paga, paciente de verdade, armazenamento ou Asaas.

O teste falha se os controles positivos não existirem, se uma operação estrangeira afetar linhas ou se uma empresa for atribuída incorretamente. Isso fornece evidência de *política de banco e gatilhos sob papel SQL autenticado*, não prova de expiração real de JWT, Auth HTTP, revogação real de sessão, armazenamento, dispositivos ou replay financeiro. A ferramenta de JWT/HTTP `scripts/saas-tenant-readonly-probe.mjs` continua pendente de execução externa autorizada.

**A aprovação do item 4.2 continua condicionada aos seus testes reais e à avaliação dos doze pacientes históricos sem clinic_id.** A regra conservadora não deve atribuir o mesmo gate duas vezes nem confundir ensaio descartável com prova operacional.
