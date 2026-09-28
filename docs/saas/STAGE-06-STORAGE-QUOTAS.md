# Etapa 06 — cota do plano e adicionais (parte 1)

Status: correção preparada em branch separada; exige restauração em CI e
aplicação controlada no banco antes de considerá-la ativa.

## Problema comprovado em 28/09/2026

A AS Lab pagou o plano `company_initial` e recebeu 25 GiB em
`clinics.storage_limit_bytes`. Ela ainda não tem linhas em
`clinic_storage_entitlements`. A rotina antiga `recalculate_clinic_storage_limit`
considera somente essas linhas e voltaria a cota a 1 GiB quando um adicional
fosse alterado. A IPO mantém 500 GiB e duas linhas históricas de base e cortesia.

## Contrato desta correção

- O plano comercial estabelecido fornece a cota incluída. Um checkout pendente
  não concede a cota prometida; suspensão mantém a cota exibida e os arquivos.
- A soma das cotas legadas `base`/`courtesy` pode elevar o piso, mas não duplicar
  os 25 GiB ou os 500 GiB já previstos no plano.
- Adicionais `purchase`/`manual` somam acima desse piso. Cancelar um adicional
  conserva a cota do plano, mesmo que o uso atual ultrapasse o novo limite;
  não apaga arquivos.
- A IPO permanece com pelo menos 500 GiB e isenção de cobrança.
- Só a função privada de entitlement ou `service_role` recalcula o valor.

O teste de restauração cria empresas descartáveis pagante e pendente, adiciona
e cancela 10 GiB, verifica os limites e desfaz todas as alterações. No banco vivo,
usar apenas `stage-06-quota-assertions.sql` após aplicar a migration. Não
executar o ensaio de escrita no banco vivo.

## Próxima parte da Etapa 06

O catálogo de reservas já contabiliza muitos uploads, mas as políticas de
`storage.objects` ainda permitem alguns envios diretos sem uma reserva. O fluxo
DICOM também precisa entrar no mesmo catálogo. Por isso, esta parte corrige a
**composição da cota**, mas ainda não certifica o bloqueio de todos os uploads
no limite. A próxima PR deve fechar essas rotas, conferir permissões por
empresa e sessão, e testar o limite sob concorrência em banco descartável antes
de publicar. A interface não deve prometer enforcement completo até essa prova.
