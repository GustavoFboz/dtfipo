# DentalFlow — DF-EID-01: execução integrada no Windows (09/11/2026)

**Origem da evidência:** captura de tela fornecida pelo proprietário em 09/11/2026, após executar o aplicativo `DentalFlow-Etapa3-Integrada.exe` no próprio Windows. Esta página registra fielmente **o resultado informado pela GUI**, não uma auditoria independente de bytes privados pela CI/GitHub. Não contém chave, caminho, nome de paciente, imagem clínica, dump ou anexo.

## Resultado observado

| Verificação | Informado pela GUI |
| --- | --- |
| Estado final | `SAMPLED_INTEGRATED_OK` |
| Pacientes recuperados | 93 |
| Casos recuperados | 86 |
| Agendamentos recuperados | 8 |
| Metadados `storage_files` recuperados | 702 |
| Amostra dos 592 históricos | 8 |
| Amostra dos 116 recuperados | 4 |
| Arquivos de amostra efetivamente abertos por parser | 12 |
| Vínculos presentes no banco restaurado e conferidos | 12 |
| Reversão SQL no banco descartável | OK |
| Contêiner Docker removido | SIM |

O programa recompôs as amostras localmente de ambos os conjuntos enquanto o banco real de 04/11 estava no mesmo ensaio PostgreSQL Supabase 17 descartável, verificou bytes/hashes disponíveis, decodificou os 12 arquivos por leitores internos e descartou o contêiner. A execução real foi atestada pela captura; os testes de CI usam somente dados artificiais.

**Código e CI da ferramenta:** [PR #272](https://github.com/GustavoFboz/dtfipo/pull/272), [build do Windows e testes sintéticos](https://github.com/GustavoFboz/dtfipo/actions/runs/42379336564), [regressão PostgreSQL sintética aprovada após nova tentativa](https://github.com/GustavoFboz/dtfipo/actions/runs/42379336522).

## Decisão de aceite delimitado

**APROVADO — recuperação operacional amostral DF-EID-01.** A etapa 3/8 de continuidade e restauração de backups pode ser contabilizada como concluída **neste escopo de risco aceito**, em conjunto com evidências anteriores: 592 objetos já autenticados; 116 objetos readback; cópia externa cifrada do banco e dos 116 conferida; inventário 708/708 reconciliado por metadados; banco real já restaurado; leitura conjunta positiva de 12 anexos e rollback SQL reportado. Não é necessário repetir 592 leituras completas sem incidente.

### Limites que continuam explícitos

- **Não prova** abertura operacional individual de 708/708 objetos, nem identidade criptográfica das **24 origens sem hash histórico comparável**; hashes disponíveis se referem à cópia recuperada, não substituem digest ausente da origem.
- **Não repara** as 4 associações históricas com caso ausente; não altera contas, banco em produção, Storage ao vivo ou Asaas.
- O programa valida links existentes do banco restaurado; **não simula autenticação real de dois usuários, RLS, signed URLs ou abertura pela interface DentalFlow**. Esses testes com **dados fictícios/QA** ficam na etapa **4/8**, sem inserir dados clínicos reais em QA conectado.
- O teste de reversão **SQL** e o descarte do contêiner **não equivalem ao rollback da versão Web implantada**. Ensaio de implantação e rollback do sistema ficam na etapa **7/8**.
- Não houve neste ensaio uma **falha forçada sobre anexo clínico real**. Tratamento de erro, chave incorreta e adulteração foram testados apenas com dados artificiais na CI. Não justifica repetir ensaio completo; eventual divergência futura exige reteste pontual.
- A GUI informa contagens/status e não expõe os IDs/hashes da amostra no GitHub. O **recibo JSON agregado** pode ser anexado posteriormente se o proprietário o salvar e compartilhá-lo; a captura é evidência de observação suficiente para o aceite amostral, mas não atestado independente de integridade de produção.
- **Beta comercial continua não publicado e não autorizado**: gates financeiros, isolamento QA, privacidade, suporte, rollout e rollback de deploy continuam pendentes.

**Rastreabilidade:** `docs/saas/BETA-RELEASE-8-EXECUTIONS.json` etapa 3; protocolo `DF-EID-01`; issue #241.