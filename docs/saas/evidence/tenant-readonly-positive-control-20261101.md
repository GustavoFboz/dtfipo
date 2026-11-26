# DentalFlow SaaS 4.2 — ensaio autenticado somente leitura, com controles positivos

**01/11/2026 — preparado, não homologado com duas sessões reais.**

## Resultado verificado antes do ensaio

As PRs #217/#218 tiveram quatro workflows com conclusão geral `success`, porém a matriz Android precisa ser avaliada por **job**:

| Job | Resultado |
| --- | --- |
| Testes gerais e restauração isolada | Passaram |
| Windows: compilação do instalador | Passou |
| Android API 35: APK + smoke no emulador | Passou |
| Android API 37: smoke experimental | **Falhou antes do script do aplicativo** |

Android 37 reportou `sys.boot_completed=1`, mas `adb shell input keyevent 82` da ação `reactivecircus/android-emulator-runner@v2` falhou com `Broken pipe (32)`, antes de executar `scripts/smoke-test-android.sh`. Mesmo com o workflow global verde, esse job **não prova compatibilidade Android 17**. É consistente com a condição de corrida da ação reportada publicamente em https://github.com/ReactiveCircus/android-emulator-runner/issues/489; a correção em https://github.com/ReactiveCircus/android-emulator-runner/pull/495 ainda não havia sido integrada na checagem. Não adotamos código externo não revisado, não desativamos o smoke e não publicamos novo APK.

## Por que o SELECT negativo anterior não basta

A consulta de inventário administrativo, agregada e somente leitura, confirmou que as duas empresas de QA aprovadas no `fixture-acceptance.server.ts` têm **0 pacientes e 0 casos** cada. Um SELECT estrangeiro retornando `[]` seria um teste vacuamente positivo: o usuário A não vê linhas de B mesmo que a política esteja incorreta, porque não existem linhas.

Para aceitar o ensaio é necessário:

1. Dois tokens JWT **reais de atores diferentes**, conferidos por `GET /auth/v1/user`.
2. `GET /rest/v1/profiles` retornando exatamente o perfil autorizado de cada ator e sua empresa.
3. **Controle positivo A:** ator A obtém exatamente um paciente de QA pertencente à empresa A.
4. **Controle negativo A:** usando o mesmo token A, o paciente de QA B não aparece.
5. Repetir controles positivo e negativo para o ator B.

Sem pacientes próprios acessíveis nos dois lados, o verificador encerra com `QA_SEEDED_POSITIVE_CONTROLS_REQUIRED` ou `QA_OWN_PATIENT_NOT_VISIBLE`, **sem alegar sucesso**. Esse preparo não cria pacientes e não muda o banco.

## Ferramenta

- `scripts/saas-tenant-readonly-probe.mjs`
- `scripts/saas-tenant-readonly-probe.test.mjs`
- CI isolada `saas-tenant-readonly-probe.yml`.

A ferramenta só envia `GET` ao projeto Supabase autorizado, não aceita hosts arbitrários, não usa `service_role`/`sb_secret_`, não imprime IDs, PII, cabeçalhos de autorização ou JWTs. Resultados não incluem dados de pacientes. Compara controle positivo e negativo sob o mesmo ator. Os testes de CI usam interceptação sintética de rede, sem credenciais reais.

A execução **real** requer fixture QA documentalmente autorizada e sem dados clínicos, dois pacientes de teste previamente criados pelo fluxo normal numa **base não produtiva**, e tokens efêmeros das sessões de QA fornecidos por via segura de secrets — não em commits, logs, mensagens ou arquivos públicos. Não preparar contas fictícias por acesso de administrador em Produção. Não requisitar nem reexecutar cobranças.

Para operação autorizada em ambiente isolado, o executor configura fora do Git os valores `DENTALFLOW_QA_SUPABASE_URL`, `DENTALFLOW_QA_ANON_KEY`, `DENTALFLOW_QA_ACTOR_A_JWT`, `DENTALFLOW_QA_ACTOR_B_JWT`, `DENTALFLOW_QA_PATIENT_A_ID` e `DENTALFLOW_QA_PATIENT_B_ID` e usa:

    node scripts/saas-tenant-readonly-probe.mjs

Não rodar sem isolamento e sem validação da origem dos fixtures.

## Aceite que permanece aberto

Este teste comprova apenas leitura de pacientes entre dois usuários e duas empresas. Não comprova revogação de sessão, operações de escrita, RLS para anexos, caminhos de Storage, MFA real, replay financeiro nem origem legítima dos 12 pacientes históricos sem clínica. O critério **4.2 permanece parcial**, assim como o aceite **6.2** de recuperação completa. Nenhuma pontuação adicional foi adicionada sem o teste autenticado real.
