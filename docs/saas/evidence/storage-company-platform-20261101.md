# DentalFlow SaaS 3.3 — segurança do Storage compartilhado entre plataformas

**01/11/2026 — escopo de engenharia, não homologação física.**

## O problema corrigido

A página de gerenciamento usava React Query com chave global `["storage_files"]`. Ao alternar empresa ou usuário no mesmo aparelho/navegador, uma resposta ou entrada antiga podia permanecer no cache e ser reapresentada em uma nova sessão, embora o RLS do banco fosse a proteção principal.

Esta correção promove defesa em profundidade **sem mudar o banco**:

1. `fetchStorageFiles(clinicId)` exige clínica, filtra `clinic_id` na consulta e rejeita qualquer linha cuja clínica não coincida na resposta.
2. `storageFilesScopeKey(userId,clinicId)` separa cache e operações otimistas por identidade e empresa; evita que o resultado tardio de uma consulta entre na lista da nova empresa.
3. A página só habilita a listagem com administrador identificado, `clinic_id` e **correspondência explícita com o usuário de Auth atual**; o cache de perfil da tela é separado por sessão. Métricas da memória global do Storage são ocultadas se pertencerem a outra clínica.
4. Os testes acrescentados recusam consultas sem empresa, resposta de outra empresa e reaproveitamento de cache em trocas de usuário/empresa.
5. CI agora exige os testes existentes de quota, cancelamento de reserva, link privado assinado/renovação, referências sem token persistido e listagem restrita.

**Plataformas compartilhadas:** Web, Windows/Tauri e Android/Capacitor usam o mesmo `src/lib/storage.ts` para seus fluxos; os builds Windows/Android são verificações independentes de empacotamento. Antes desta revisão, o [Android API35 e API37](https://github.com/GustavoFboz/dtfipo/actions/runs/41330255173) passou em ambos os smoke tests emulados. Isso **não** comprova download, upload, abertura local ou limpeza offline em aparelhos físicos.

### Fronteira do item 3.3

Os controles de cliente acima e as provas de compilação são marcos técnicos independentes, não aceite final. Permanecem: transferência real de arquivos de caso e paciente em **Windows e Android físicos**, abertura/download e tratamento de falhas de rede, cache por identidade/assinatura offline e validação da distribuição efetiva. Não publicar instaladores automaticamente só para elevar o indicador.

**Observação de segurança:** RLS e autorização por assinatura do servidor continuam obrigatórias; o filtro do cliente nunca é substituto de RLS.
