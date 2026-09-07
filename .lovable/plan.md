# Auditoria somente leitura — listas vazias no DentalFlow Desktop (Windows)

Nada foi alterado: nenhuma escrita, nenhuma migration. Só consultas de leitura e uma chamada de teste sem autenticação.

## 1. Os dados existem no Lovable Cloud

| Tabela | Registros |
| --- | --- |
| patients | 46 |
| cases | 37 |
| case_types | 5 |
| stages | 46 |
| phases | 10 |
| stock_items | 38 |
| component_categories | 8 |
| clinics | 1 |
| profiles | 14 |
| clinic_members | 12 |
| cadistas | 4 |
| doctors | 6 |

Clínica principal: "IPO — Instituto Praia de Odontologia", `kind = laboratorio`, `company_type = IPO`, `modules_enabled = {laboratory, financial, clinical}`, dono `gustavovitorfa@gmail.com`, código de convite ativo. Todos os 13 perfis (menos `dentalexample@gmail.com`) estão vinculados a essa clínica.

Conclusão: não há perda de dados. O problema é de leitura/permissão, não de conteúdo.

## 2. Causa principal confirmada: resposta vazia quando a sessão não está autenticada

Todas as políticas de leitura dessas tabelas valem apenas para usuários autenticados. Testei a leitura sem sessão (apenas chave pública) nas sete tabelas:

```text
patients / cases / case_types / stages / phases / stock_items / component_categories
→ HTTP 200  []
```

Ou seja: sem sessão válida o servidor **não devolve erro** — devolve sucesso com lista vazia. Isso reproduz exatamente o sintoma relatado: app "online", sem mensagem de erro, alguns indicadores aparecendo (cache local / contadores locais) e todas as listas vazias.

Reforça essa hipótese o próprio código do desktop: `canUseDentalFlowCloud()` libera a tentativa de leitura na nuvem apenas com um "provisionamento de dispositivo" válido, mesmo sem token de nuvem real. Nesse estado o app tenta a leitura, recebe `200 []` e mostra listas vazias como se fossem dados reais.

## 3. Causa secundária real: perfis sem papel que dê acesso

A leitura de pacientes, etapas e fases exige `is_staff()`, que aceita apenas: admin, dentista, recepcionista, auxiliar, protetico, SOLICITANTE. **"cadista" não está nessa lista** e, em estoque, cadista é explicitamente excluído.

Papéis atuais:

- `gustavovitorfa@gmail.com`: admin + protetico — acesso completo, OK.
- Também admin: `leandrocarvalhobmf@gmail.com`, `flaviaalbuquerque015@icloud.com`.
- Somente "cadista": `naiaramatrix@gmail.com`, `vanessaprovencemarques@gmail.com` → para essas contas pacientes, etapas, fases e estoque voltam legitimamente vazios, mesmo autenticadas.
- `dentalexample@gmail.com`: sem papel algum e sem clínica → tudo vazio.

## 4. Diagnóstico final

1. Dados íntegros no Cloud; clínica IPO e módulos corretos.
2. Se a conta usada no Windows for admin (ex.: Gustavo), o cenário compatível é **sessão de nuvem ausente/expirada no aplicativo instalado**, com o app se apresentando como online por causa do provisionamento local — leituras retornam `200 []` e a interface trata isso como "sem dados".
3. Se a conta usada for "cadista" ou sem papel, o vazio é consequência das políticas de permissão atuais.

## 5. Próximos passos sugeridos (nenhum aplicado)

- Confirmar qual e-mail está logado no Windows e se há token de nuvem persistido válido.
- Corrigir a interface para distinguir "sem permissão / sem sessão" de "sem dados", em vez de mostrar lista vazia silenciosa.
- Decidir, como regra de produto, se "cadista" deve ler pacientes/etapas/fases/estoque — hoje não pode.
