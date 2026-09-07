# DentalFlow Desktop 0.2.8 — correção da raiz das listas vazias

A auditoria do Lovable Cloud confirmou que os dados de pacientes, casos, etapas, categorias e estoque existem. O defeito estava no cliente Windows: uma sessão local do dispositivo podia ser tratada como suficiente para tentar leituras protegidas enquanto o Windows estivesse fisicamente online. Sem JWT Cloud válido, o RLS podia responder `200 []`, e versões anteriores podiam interpretar esse vazio como conteúdo real.

A 0.2.8 muda a regra:

- sessão local libera somente SQLite/offline;
- leitura protegida do Lovable Cloud exige sessão Cloud realmente validada;
- respostas vazias ambíguas não podem substituir snapshots válidos;
- a primeira sincronização só é considerada concluída depois de comparar contagens autorizadas via RLS com os read-models locais de pacientes, casos, tipos de caso, etapas, fases, profissionais, categorias e estoque;
- se a sessão Cloud precisar ser renovada, o Desktop mostra uma tela explícita de reautenticação e só depois sincroniza novamente;
- todo o frontend permanece empacotado no instalador Tauri (`../dist/client`).

Nenhuma migration nem alteração destrutiva no banco é necessária para esta correção.
