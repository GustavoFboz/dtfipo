# DentalFlow — 8 execuções até a publicação do beta Web pago

**Escopo:** beta comercial Web **somente por convite**, sem confundir com a homologação completa (13/23 aceites formais) e com o avanço técnico registrado separadamente (94,06%). Nenhum script deste roteiro publica, altera cobrança ou concede acesso.

**Estado auditado em 02/11/2026:** **1/8 concluída (12,5%)**. Fonte/branch `saas/stage-03-asaas-checkout`, SHA do snapshot `dcbd8ecab67892593036c7008c194287ffd38023`. **Não há evidência de que esse SHA já esteja servido no site público; publicação da nova versão ainda não realizada.**

A fonte de verdade dos estados deste novo roteiro é [BETA-RELEASE-8-EXECUTIONS.json](./BETA-RELEASE-8-EXECUTIONS.json). A fonte de verdade dos **oito P0 obrigatórios** é [PAID-BETA-READINESS.json](./PAID-BETA-READINESS.json); o roteiro **não substitui** esse gate nem o `saas-sales-release-gate` para vendas gerais.

| Etapa | Estado | Executor | Objetivo verificável |
|---|---|---|---|
| **1/8** Auditoria e base estável | **Concluída** | ChatGPT / GitHub / consulta Cloud | SHA sincronizado entre editor e branch, CI geral Web verde, RLS nos principais dados e estado de pacientes/cobranças lido sem escrita |
| **2/8** Destino e credenciais de backup | **Bloqueada: acesso seguro** | ChatGPT prepara; proprietário autoriza origem + destino | Um *executor independente dos créditos de IA do Lovable* consegue ler Storage com privilégio mínimo e gravar/relêr criptograma fictício num Drive privado. Chave fora do destino |
| **3/8** Recuperação e restauração completa | Pendente | ChatGPT / executor privado | Download **116 arquivos / 1.968.840.906 bytes**, reconciliação dos **708** históricos e delta posterior, cópia atual do banco, verificação e restauração isolada **juntas** |
| **4/8** Segurança de empresas e casos | Pendente | ChatGPT / QA autorizado | Casos criar/abrir/editar; duas empresas fictícias; nenhum acesso cruzado, alteração de dono indevida ou vazamento de cache |
| **5/8** Asaas e regras de acesso | Pendente | ChatGPT / Sandbox; proprietário apenas se houver teste pago controlado | Cobrança/valor, renovação, cancelamento, inadimplência, reativação, webhooks idempotentes e bloqueio imediato de novas adesões |
| **6/8** Documentos legais e operação beta | Pendente | ChatGPT prepara; proprietário aprova | Termos e privacidade **reais**, aceite versionado, comunicação explícita de beta, limite de convites, suporte e diagnóstico sem dados de pacientes |
| **7/8** Staging, pré-publicação e reversão | Pendente | ChatGPT / infraestrutura | Sem secrets financeiros nem agendadores herdados no remix, smoke de Web/servidor, comparação de revisão e ensaio de rollback de **deploy** sem alterar Produção |
| **8/8** Publicação e smoke da versão beta | Pendente | ChatGPT executa; proprietário confirma abertura | Todos os 8 P0 documentados e revisados, autorização operacional final, deploy com identificação, fluxo real limitado testado, URL publicada e plano de incidentes pronto |

## Ações que exigem o proprietário

**Na etapa 2:** escolher uma forma segura de o executor externo acessar o Storage de origem e o Google Drive de destino. O OAuth do Google Drive já conectado **dentro do Lovable** não autoriza automaticamente GitHub Actions ou este ChatGPT a enviar arquivos, e o repositório `dtfipo` está **público**. Portanto **NUNCA** colocar chaves, credenciais, arquivos clínicos, índices decifrados, histórico de pacientes ou URLs assinadas no repositório, em Issues, artefatos públicos ou neste chat. Alternativas: executor local no Windows do proprietário com pasta privada sincronizada pelo Google Drive para Desktop; ou executor externo separado com autenticação de escopo mínimo e segredos próprios. Somente arquivos **já cifrados** vão para o destino. Antes do primeiro byte real, testar criptografia, integridade e leitura de um objeto *fictício*.

**Na etapa 4:** se não houver duas contas de teste em ambiente segregado, aprovar QA com identidades e dados exclusivamente fictícios. **Não** usar a conta IPO ou outra clínica real para testes destrutivos.

**Na etapa 5:** confirmar os preços e o comportamento de cobrança pretendidos. Nenhuma cobrança de cartão de teste real, estorno ou cancelamento de assinatura de produção será iniciado sem autorização específica.

**Na etapa 6:** validar formalmente os textos reais (termos, privacidade, condições de beta e LGPD), o canal de suporte, os limites de armazenamento e o primeiro grupo de convidados. Os rascunhos técnicos existentes não são aprovação jurídica.

**Na etapa 8:** aprovar explicitamente o início do piloto pago depois de analisar o checklist final. Isso é distinto da autorização geral para desenvolver e preparar.

## Restrições invioláveis

- Nenhum deploy que altere dados/cobranças antes de backup externo autenticado, restauração isolada e revisão de rollback.
- Não simular ou forçar `verified` dos oito P0 para elevar o contador; **1/8** mede execuções do plano, não prontidão de vendas.
- A única conta real com estoque não deve ter pacientes/casos ou saldos apagados. Doze órfãos foram revisados anteriormente: onze excluídos após cópia restrita e um **preservado** por vínculo com agendamento legítimo. Não eliminar o vínculo apenas por cumprir número.
- 592/708 objetos históricos guardados e verificados fora da origem; 116 ainda faltam. O agente Lovable ficou sem créditos, **mas isso não impede desenvolvimento via GitHub/consulta Cloud**. Pode impedir execução da ponte Storage→Drive dentro da IA do Lovable; buscar executor separado é parte desta etapa.
- A publicação **Web** beta pode acontecer antes de parte dos 23 testes físicos Android/Windows, mas **não** antes dos P0 referentes a dados, isolamento, cobrança, aceite e reversão.
- Para comprovação, registrar URLs de CI/PR e recibos auditáveis *sem segredos nem informações clínicas*; mudanças de status devem passar por PR.

## Comandos de auditoria somente leitura

```bash
node scripts/saas-beta-eight-executions.mjs
node --test scripts/saas-beta-eight-executions.test.mjs
node scripts/saas-paid-beta-pilot-gate.mjs
```

O primeiro reporta `1/8` enquanto só a auditoria estiver concluída; o gate de vendas permanece `blocked` enquanto os P0 não forem verificados. **Nenhum comando acima publica, cobra, insere ou modifica dados.**

Referência operacional: [issue #241](https://github.com/GustavoFboz/dtfipo/issues/241).
