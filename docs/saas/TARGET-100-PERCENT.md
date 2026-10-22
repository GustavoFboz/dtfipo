# Conclusão integral do protocolo SaaS

Retomada de 21/10/2026. O titular solicitou chegar a **100%** e ofereceu acesso
à administração Lovable caso necessário. A meta substitui a antiga meta de
50%; o denominador continua sendo **23 aceites finais**. Baseline comprovado:
**8/23 (34,78%)**, 15 itens abertos/parciais e 0/7 etapas encerradas, após a
prova de identidade das 23h49 Manaus de 21/10.
O [registro oficial](ACCEPTANCE-PROGRESS.md) conserva cada prova já aceita.

Em 22/10, 10h43 Manaus, a correção de marcadores de leitura foi publicada e
passou 112/112 verificações reais (84 de Storage e 28 novas de privacidade e
autorização), preservando todo o histórico. Sem aceite novo: 8/23 mantidos.
[Publicação e limites](evidence/activity-read-publication-20261022.md).

## Publicação autorizada e identidade comprovada

O titular autorizou expressamente administrar o Lovable Cloud, publicar as
atualizações SaaS em Produção e ajustar a política de senhas. A publicação nativa
`486889a2-09b2-4874-9aa5-b68c4321cfc4` partiu da revisão integrada `ef31ce3`;
o painel confirmou o site atualizado. O mínimo global de oito caracteres foi
salvo e o job `dfebc679-bf17-4646-afab-2ee8171e4afc` passou 16/16 checks reais.
O item 4.1 está concluído. A autorização anterior pendente está resolvida;
seu checkpoint permanece como registro histórico. Nenhuma chave Asaas nova
foi necessária. Desenvolvimento continua pelo GitHub, sem usar o builder AI.
[Publicação, recibos e limites](evidence/authorized-publication-20261021.md).

## Diagnóstico operacional preparado pelo GitHub

O workflow existente `SaaS Production credentials readonly check` ganha uma
etapa **somente em execução manual**, após os diagnósticos de conta e webhook.
Ela executa `scripts/inspect-asaas-reported-queue.mjs` e salva
`production-queue-alert.json` junto dos artefatos já existentes. Os disparos
automáticos por push não executam essa etapa adicional.

Pré-requisitos: publicação autorizada do endpoint `production-queue-alert`,
revisão do workflow selecionada contendo o script, runtime Production ativo e
o secret `BILLING_PRODUCTION_WORKER_TOKEN` já configurado. Nenhuma nova chave é
criada. O script faz um único GET para endereço fixo, não segue redirecionamento,
limita tempo/tamanho e não aceita URLs informadas no ambiente. A saída contém
somente campos permitidos; omite IDs de provedor, endpoints, contatos e tokens.

Um job verde significa que o diagnóstico foi coletado, **não** que a fila foi
corrigida ou que um aceite financeiro passou. Listagem parcial, ausência ou
duplicidade ficam inconclusivas. Mesmo uma correlação conclusiva não consulta
os Logs de Webhooks nem altera filas: causa HTTP, retomada e prova de entrega
têm verificações próprias. Não disparar este diagnóstico antes de comprovar a
publicação do endpoint esperado.

Execução real concluída em 22/10, 00h05 Manaus: workflow #18, revisão `0bdc69d`,
listagem completa de duas filas. A fila “Teste Webhook Unika POS” aponta para
outro endpoint e está interrompida; a do DentalFlow está ativa, sem interrupção,
API v3, sequencial e com 13 eventos. Nenhuma fila foi alterada. A causa HTTP e
o tratamento da integração externa dependem dos seus logs e finalidade; não
desativá-la por ser chamada “Teste”. [Recibo e limites](evidence/authorized-runtime-validation-20261022.md).

## Provas restantes dos 15 itens

| Item | Trabalho para concluir e condição de aceite |
| --- | --- |
| 1.1 | O titular revisa os dois eventos manuais Sandbox com sessão Master/AAL2 real, usando a decisão auditada existente. Não atribuir o pagamento externo a uma empresa nem inventar AAL2. |
| 1.3 | Preparar execução financeira isolada em Sandbox e observar uma falta real de webhook, seguida de reconciliação com GET do provedor, uma única linha no ledger e período correto. O job atual recusa runtime Production; não trocar globalmente o ambiente da conta paga. |
| 2.1 | Executar renovação, atraso/carência, suspensão, estorno/contestação, cancelamento e reativação com estados reais do provedor. Ensaios SQL e mocks permanecem regressões. |
| 2.2 | Conferir dados clínicos, contratos, ledger, limites e período pago antes/depois dos fluxos reais. A isenção IPO e dados de outras empresas devem permanecer preservados. |
| 2.3 | Validar acesso online, expiração/limpeza do cache em 72h e retomada nos aplicativos disponíveis. Builds e emuladores não substituem os testes em aparelhos; registrar limites da homologação iOS. |
| 3.2 | A resiliência ampliada publicada passou 84/84 verificações reais. Falta revisar individualmente as nove reservas históricas e usar recuperação autenticada do gestor quando cabível. Não excluir metadados históricos diretamente por SQL nem liberar cota com bytes existentes. |
| 3.3 | Executar upload, leitura, limite, falha e exclusão em Web, Windows e Android disponíveis. DICOM aguarda a liberação de Radiologia. |
| 4.2 | Após a correção publicada de marcadores e recusa USER/AAL1 real, concluir Master/MFA e replay positivos reais e tratar as onze tabelas legadas. Definir a propriedade por empresa dos dados de estoque antes da migração; a estrutura atual não identifica o dono. |
| 4.3 | Tratar e comprovar a revogação das referências assinadas históricas: 40 reconferidas em 22/10 (34 fotos e seis avatares), ainda válidas até 2036. Comprovar também leitura, recusa, expiração e renovação autenticadas na publicação. Substituir uma referência não revoga um token já emitido. |
| 5.2 | Executar o cancelamento aprovado uma vez no Asaas e concluir troca de plano/preço por vigência. A execução de troca ainda requer implementação e prova; o executor de cancelamento existente não a substitui. |
| 5.3 | Validar downgrade, cota, preço/data efetiva e retomada após falha ambígua, com lease/readback e sem POST financeiro repetido cegamente. |
| 6.2 | Fazer backup/restauração operacional de dados e arquivos em destino isolado, comparar integridade e ensaiar incidente/rollback. Restauração limpa só de schema é parcial. |
| 6.3 | Concluir onboarding de empresa nova no Sandbox, paridade de plataformas e medição da capacidade do lote piloto. A meta futura de 10 mil usuários não é capacidade comprovada. |
| 6.4 | Preparar documentos comerciais/privacidade com dados reais do responsável, suporte e regras do serviço; obter a revisão aplicável antes da oferta. Minuta técnica não equivale a revisão jurídica concluída. |
| 7.4 | Registrar aprovação explícita para vendas após os demais aceites, com revisão publicada, preço comercial, tamanho do piloto e acompanhamento definidos pelo titular. O teste de R$5 não define sozinho a oferta comercial. |

## Conferência de 21/10

Consultas somente leitura: às 14h23 UTC havia um pagamento Production, nenhum
evento Production falho/dead letter e nove reservas antigas. Às 14h24 UTC, o
worker Production tinha status `ok`, com último heartbeat saudável às 14h21.
Nenhuma dessas leituras executou um novo job nem encerrou um dos itens acima.

O [checkpoint inicial desta retomada](evidence/continuity-20261021.json) registra
a autorização então pendente, agora resolvida. Preservar os aceites já concluídos,
preço Inicial de teste de R$5, contratos históricos de R$1, IPO e janela offline.
