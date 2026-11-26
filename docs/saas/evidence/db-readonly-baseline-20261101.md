# DentalFlow SaaS 6.3 — baseline real de baixa carga (01/11/2026)

**Tipo:** duas consultas SELECT agregadas, exclusivamente leitura, no PostgreSQL conectado via Lovable Cloud. Nenhuma escrita, autenticação de pacientes, ensaio de carga, evento Asaas ou inspeção de conteúdos clínicos. Não representa capacidade de 10 mil usuários.

## Resultado observado

| Medição | Observação |
| --- | ---: |
| Conexões totais em `pg_stat_activity`, incluindo outros DBs | 15 |
| Conexões `active` no instante observado | 1 |
| Conexões `idle` | 7 |
| Conexões `idle in transaction` | **0** |
| `pg_stat_database.numbackends` para o database atual | 9 |
| Commits históricos (cumulativo) | 16.183.034 |
| Rollbacks históricos (cumulativo) | 889.171 |
| Deadlocks históricos (cumulativo) | 0 |
| Leitura de blocos do disco (cumulativo) | 4.744 |
| Cache hits do PostgreSQL (cumulativo) | 14.845.540.565 |

**Limites essenciais:** `pg_stat_activity` soma todas as bases; `pg_stat_database` acima mede apenas `current_database()`, de modo que 15 e 9 não são medições conflitantes. Contadores acumulados não são taxas nem comprovam incidentes recentes. A observação não mede CPU, RAM, latência do navegador, saturação do Realtime, throughput ou limite de usuários; não há baseline antes/depois da mesma carga.

Um script SQL de **duas consultas SELECT** reproduz as mesmas métricas sem expor `query`, `usename`, endereço IP, usuários, emails, pacientes ou pagamentos: `docs/saas/sql/readonly-capacity-baseline.sql`. Esta fotografia é apenas uma referência inicial para configurar um estágio isolado e limites de interrupção. Não repetir consultas em alta frequência, nem usar Produção como ambiente de estresse.

O marco `database-realtime-baseline` de 6.3 permanece pendente até medir também Web, Realtime, CPU/RAM e latência comparável no staging. O preparo SQL é independente e **não autoriza piloto de carga**. O gate 6.3 completo requer staging sem PII, testes progressivos, critérios de parada e aceite de dispositivos.
