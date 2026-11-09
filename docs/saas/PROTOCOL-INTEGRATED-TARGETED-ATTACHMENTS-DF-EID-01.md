# Protocolo DentalFlow — Ensaio Integrado Direcionado de Recuperação e Abertura dos Anexos

**Código:** DF-EID-01 · **Versão:** 1.0 · **Criação:** 07/11/2026 · **Estado:** **amostra operacional executada e aprovada**, segundo captura do proprietário de 09/11/2026; controle de acesso autenticado em QA é verificado separadamente na etapa 4.
**Responsável técnico:** fluxo de testes DentalFlow / GitHub + execução privada autorizada no Windows.
**Escopo:** continuidade da etapa **3/8** do protocolo SaaS, sem reabrir auditoria criptográfica desnecessária.
**Gatilho:** executar em janela própria, após preparar a infraestrutura isolada; **não é um novo impedimento para começar paralelamente os testes P0 de casos, Asaas, segurança, privacidade e rollback do beta**.

## 1. Objetivo e limite da garantia

Provar de maneira prática que **anexos representativos dos dois grupos de backup** podem ser recuperados, mantêm seus bytes e formato, abrem corretamente, preservam a associação ao paciente/caso/empresa e obedecem a autorização de acesso **em um ambiente isolado**.

**Não confundir:**
- **708/708 inventariados e copies cifradas verificadas:** evidência já disponível, não precisa ser repetida sem divergência.
- **Uma amostra de anexos realmente aberta:** comprova apenas o caminho de restauração, leitura, apresentação e autorização **da amostra testada**. Não garante abertura individual de todos os 708.
- **Garantia individual de abertura para cada um dos 708:** exigiria validar a decodificação/renderização de **todos** os arquivos suportados, além da identidade dos 24 sem digest histórico comparável; **não será proclamada por amostragem**.
- Os 702 registros da tabela \`public.storage_files\` em 04/11 **não** devem ser equiparados automaticamente aos 708 objetos do snapshot de 29/10. São inventários de escopo/datas diferentes, com possíveis referências não representadas nessa tabela.

## 2. Evidências existentes que serão reutilizadas sem refazer

| Conjunto | Evidência preservada | Situação |
|---|---|---|
| Banco 04/11 (PGDMP cifrado, 2.439.186 bytes) | Restore real no PostgreSQL Supabase descartável; 93 pacientes, 86 casos, 8 agendamentos, 702 metadados Storage | Aprovado **para restauração do banco**, não para integração operacional |
| Volumes históricos 29/10 (33 ZIPs) | 592 objetos arquivados, cifrados e verificados por AES-GCM/SHA-256 | Não repetir leitura completa salvo indício de falha |
| Recuperação dos faltantes (14 partes cifradas, índice histórico) | 116/116 objetos conferidos na ferramenta Windows em 07/11; 14/14 partes; 92 ETags MD5 equivalentes; 24 sem digest histórico; 0 itens inválidos | Aprovado como readback da cópia recuperada |
| Inventário do snapshot | 708/708 objetos dos 4 buckets históricos coincidem por metadados versionados | Evidência de reconciliação de metadados, não abertura de arquivos |
| Exceções históricas | Quatro linhas de anexos ligadas a caso histórico ausente; 24 objetos sem hash antigo comparável | Preservar e registrar; não corrigir vínculos nem alegar prova de identidade |

Os 14 arquivos \`part-*.dfenc\` de recuperação são **diferentes** dos 33 ZIPs históricos; as chaves do índice de 29/10, do pacote dos 14 e do banco de 04/11 são distintas.

## 3. Ambiente e condições de segurança (pré-requisitos)

1. Usar máquina privada com espaço/disco suficiente, acesso restrito e armazenamento criptografado, e uma pasta **nova e exclusiva para ensaio**. Não mover, substituir, descompactar por cima nem apagar as cópias originais e suas chaves.
2. Banco de teste descartável com PostgreSQL Supabase compatível (imagem previamente validada \`supabase/postgres:17.11.0.018\`), **rede desabilitada**, nenhuma porta externa, sem volumes de dados clínicos montados no container. Desligar \`pg_cron\` e verificar que não há agendamentos/egress habilitados antes de importar. Não inserir URL do banco da IPO nem credentials Asaas.
3. O banco de 04/11 deve ser restaurado do mesmo pacote local cifrado que já passou no ensaio anterior. Para cruzamento com anexos, este novo ensaio deve **manter o ambiente isolado ativo até o fim das verificações**, e destruir a cópia ao término; não usar o EXE antigo como se deixasse um banco persistente, pois ele encerra o container.
4. Recuperar **somente os arquivos selecionados** para uma pasta privada e temporária (nomes/caminhos bucket/objeto originais preservados internamente). Caso a ferramenta use extração para testar abertura, guardar plaintext exclusivamente na área temporária criptografada e removê-lo após auditoria. Alternativamente, abrir em memória para formatos suportados. Nunca gravar documentos em logs, GitHub, Lovable, Drive em claro ou chat.
5. Para simular abertura **pela interface web**, criar/usar QA verdadeiramente segregado com **arquivos fictícios e usuários fictícios**, salvo se existir autorização específica e comprovado bloqueio de egress/segredos. **Não importar prontuário real para um Lovable QA conectado à internet** para fazer o teste.
6. Proteção de privacidade: capturas com **somente contagens e status**; sem nomes, IDs, fotos, radiografias, URLs assinadas, tokens ou caminhos. As chaves privadas permanecem em arquivos locais separados.

## 4. Seleção dirigida de amostra

Construir lista privada a partir dos inventários autenticados sem imprimir nomes. Escolher **até 12 itens, podendo ampliar só em caso de falha**:

- **4** dos 592 arquivados (distribuir por formatos, buckets e tamanhos quando existirem).
- **4** dos 116 recuperados (incluir ao menos **2** daqueles 24 sem digest histórico comparável, se acessíveis; registrá-los como sem prova criptográfica da origem).
- **4** escolhidos a partir das **referências do banco restaurado** (\`storage_files\`/\`case_attachments\`) para cobrir relações com casos/pacientes/empresa, incluindo pelo menos um anexo de caso com associação válida, um de paciente e diversidade de formato — caso os mesmos objetos já estejam entre os oito primeiros, reutilizar, sem exceder a amostra.
- Procurar, quando presentes, pelo menos uma imagem e um arquivo grande ou ZIP/PDF/documento odontológico; testar arquivos sem formato compatível por leitura e validação estrutural, não inventar visualizador.
- Tratar os **4 registros históricos cujo caso de destino está ausente** apenas como exceções para contagem e documentação; não relinkar ou excluir. Se algum deles entrar na amostra, o teste de associação a caso deve ser **não aplicável / exceção conhecida**, sem reprovar o backup por isso.

Se um bucket/formato não estiver presente no material de origem, marcar **não aplicável**; não fabricar cobertura.

## 5. Procedimento da execução dirigida

| # | Ação | Evidência mínima, sem dados pessoais |
|---|---|---|
| 1 | Registrar ID do ensaio, revisão do código, snapshot/versões dos dois grupos e tipo de ambiente; validar isolamento (sem rede, portas, secrets, cron e produção) | Isolamento **passou/falhou**, SHA da ferramenta, hora UTC |
| 2 | Restaurar a cópia do **banco real 04/11** no PostgreSQL temporário, sem sair da sessão até a conclusão | 93 pacientes, 86 casos, 8 agendamentos, 702 linhas de \`storage_files\` (ou explicar divergência por snapshot) |
| 3 | Consultar apenas contagens e vínculos de \`storage_files\`, \`case_attachments\`, \`storage.objects\` e casos; distinguir os 708 objetos históricos dos 702 metadados atuais | contagens por bucket e exceções; sem imprimir IDs privados |
| 4 | Selecionar a amostra privada dos **592 + 116** de forma determinística e registrada só localmente | tamanho da amostra, distribuição por fonte/formato, cobertura de relações |
| 5 | Restaurar os bytes selecionados a partir de ambos os conjuntos em diretório ou leitor isolado; conservar caminhos bucket/objeto | total selecionado/recuperado, bytes conferidos, digest verificável quando disponível |
| 6 | Validar abertura real local com leitor confiável apropriado: PDF renderiza página; imagem decodifica pixel; STL/arquivo técnico abre com parser seguro; formatos não suportados = **não comprovado**, nunca “abriu” por extensão apenas | status **abriu / falhou / formato não suportado** por grupo e tipo, sem capturas do conteúdo |
| 7 | Confrontar objeto, \`bucket_id\`, \`object_path\`, caso/paciente/empresa conforme o banco; **separadamente**, validar interface/autorização com 2 contas QA fictícias e arquivos sintéticos, negando acesso cruzado | relações conferidas, exceções, número de acessos indevidos (**meta = 0**) |
| 8 | Simular falha de leitura ou restauração antes do aceite e reversão/descarte controlado do ambiente, conferindo que originais nunca mudaram; nenhuma chamada financeira | operação reverteu, ambiente removido, produção não tocada |
| 9 | Registrar relatório agregado e decisão: aprovado **na amostra**, pendente ou falhou; se houver falha, bloquear avanço do gate relevante até correção direcionada | recibo com resultados técnicos, limitações e responsável |

**Não tentar abrir arquivos diretamente de uma pasta sincronizada com Google Drive durante o ensaio**, para evitar egress inesperado. Baixar/usar cópias cifradas já disponíveis localmente e realizar o teste com rede desligada.

## 6. Aceite, falha e resposta

O **ensaio direcionado** será aprovado apenas quando:
- Restore real do banco em isolamento novamente confirmado e suas relações de amostra verificadas;
- **100% dos arquivos selecionados que têm leitor compatível abrem de verdade**, sem truncamento ou discrepância de tamanho/hash disponível;
- A abertura pela interface de QA (fixtures, duas empresas) respeita o vínculo correto e nega acesso cruzado; não há segredos, cobrança, job ou conexão de produção;
- Uma falha forçada é tratada com restauração revertida, artefatos temporários removidos e os backups originais preservados;
- Exceções **24 sem digest de origem**, 4 vínculos históricos e formatos não suportados são registradas explicitamente, nunca declaradas resolvidas sem teste.

**Falha =** qualquer hash comparável divergente, anexo compatível que não abra, associação errada, acesso cruzado, egress, cobrança acionada, impossibilidade de remover dados temporários ou quebra de rollback. Ao detectar falha: **abortar**, preservar backups, registrar apenas código/categoria sem PHI, não corrigir dados clínicos por suposição, e executar reteste **somente do ponto comprometido** após a correção.

**Alcance do aceite:** comprovação de recuperação operacional **dos arquivos da amostra** + integridade de cópias já autenticadas. Não promete que os 708 abrem individualmente, que as 24 origens estão criptograficamente comprovadas, ou que Auth, Vault, Asaas e deploy estão prontos. O beta ainda depende dos demais P0 e aprovação expressa.

## 7. Formato de recibo e resultado real de 09/11/2026
### Resultado real reportado no Windows — 09/11/2026

A captura de tela apresentada pelo proprietário mostrou `SAMPLED_INTEGRATED_OK`, com **93 pacientes, 86 casos, 8 agendamentos, 702 registros de Storage** importados no banco temporário. Foram recuperados e abertos **8 dos 592 arquivos antigos e 4 dos 116 recuperados**, total **12/12 arquivos abertos** e **12 vínculos conferidos**. A interface reportou **reversão OK** e **contêiner removido SIM**. Registro anonimizado: [DF-EID-01 — execução real observada em 09/11](./evidence/df-eid-01-owner-integrated-sample-20261109.md).

**Decisão:** a **recuperação operacional amostral** da etapa 3 está aprovada por evidência do proprietário, sem repetir 592 leituras. O teste de autorização por duas contas com dados sintéticos é necessário na **etapa 4**; o rollback de publicação Web é da **etapa 7**. Não se equipara a amostra à validação de todos os 708, e os 24 sem digest histórico permanecem ressalva. Os campos pendentes do modelo de recibo abaixo ilustram verificações que não foram demonstradas pela GUI, não invalidam a execução concluída em seu escopo.



\`\`\`text
Protocolo: DF-EID-01 | Versão: 1.0
Executado em: PENDENTE | Operador: PENDENTE
Ambiente isolado (rede/portas/cron/segredos): PENDENTE
Banco 04/11 restaurado (93/86/8/702): PENDENTE
Itens amostrados dos 592: PENDENTE
Itens amostrados dos 116: PENDENTE
Itens com vínculo no banco: PENDENTE
Arquivos recuperados / selecionados: PENDENTE
Arquivos realmente abertos / testáveis: PENDENTE
Formatos não suportados: PENDENTE
Vínculos corretos / testados: PENDENTE
Acesso cruzado indevido em QA fictício: PENDENTE
Falha e rollback ensaiados: PENDENTE
Os 24 sem hash de origem continuam não comprovados: SIM
Os 4 vínculos históricos preservados: PENDENTE
Conclusão: NÃO EXECUTADO
Beta comercial autorizado por este ensaio: NÃO
\`\`\`

## 8. Relação com lançamento

Este documento registra o roteiro **já executado para a recuperação amostral em 09/11**, e não solicita repetir agora os 33 volumes ou os 14 ZIPs. As equipes podem continuar imediatamente os testes críticos das **etapas 4, 5, 6 e 7** em paralelo. O ensaio DF-EID-01 fornece a evidência operacional dirigida da etapa 3 antes do aceite definitivo; a decisão de publicação exige ainda os oito P0 de \`PAID-BETA-READINESS.json\`, não depende de uma nova auditoria byte a byte dos 592 arquivos já autenticados.

**Referências internas:** \`docs/saas/BETA-RELEASE-8-EXECUTIONS.json\`, \`docs/saas/PAID-BETA-FAST-PATH-20261107.md\`, \`docs/saas/evidence/live-database-isolated-restore-20261106.md\`, \`docs/saas/sql/clinical-storage-restore-aggregate-preflight.sql\`, \`docs/saas/OPERATIONAL-RECOVERY.md\`, issue #241.
