# DentalFlow SaaS — sete etapas restantes até vendas

Atualizado em 04/10/2026, horário de Manaus. Este é o contador de conclusão
apresentado ao responsável. Os IDs 00–10 dos documentos técnicos permanecem
para manter o histórico; não são um segundo protocolo.

**Restam 7 de 7 etapas com aceites em aberto.** Há código e provas parciais
em todas elas; um incremento aprovado não encerra automaticamente a etapa.
Frentes desta rodada: **3/7 (armazenamento)** e **4/7 (segurança de acesso)**.
Produção saiu da antiga etapa 09 e ganhou a etapa técnica 10, tornando explícita
a conexão necessária para receber dinheiro real.

| Ordem restante | Documento técnico | Critério para encerrar |
| --- | --- | --- |
| 1/7 — Eventos e reconciliação | 04 | Duplicata sem duplicar pagamento/acesso; perda de webhook recuperada; eventos fora de ordem; dois dead letters revisados individualmente e replay autorizado com evidência Asaas. |
| 2/7 — Ciclo da assinatura | 05 | Renovação, atraso, carência, suspensão, estorno/chargeback, cancelamento e reativação comprovados; nenhuma exclusão de dados; acesso online e prazo offline coerentes. |
| 3/7 — Armazenamento | 06 | Upload, bloqueio por limite, falha/retentativa e exclusão nos módulos disponíveis: caso, paciente, foto e avatar; reserva e tamanho real consistentes; concorrência; revisão individual de reservas e objetos históricos; prova em Web e aplicativos instalados. |
| 4/7 — Segurança, identidade e Master | 07 + revisão de segurança da 09 | Cadastro/confirmação/recuperação de senha; política aplicada no Auth; sessões reais, MFA e troca/logout; tentativas de acesso a outra empresa/elevação de privilégio/replay em AAL1 recusadas; arquivos privados; revisão de secrets, superfícies públicas e ações administrativas; resultados e riscos registrados. |
| 5/7 — Gestão pelo cliente | 08 | Histórico e cobrança corretos; cancelamento/troca executados no Asaas uma vez; preço e vigência explícitos, downgrade compatível com limites e reconciliação após falha. |
| 6/7 — Operação e preparo do beta | 09 | Revisão publicada confirmada; worker regular e monitorado; alerta entregue e incidente ensaiado; backup/restauração/rollback; fluxo de cliente novo em Sandbox de ponta a ponta; paridade Web/Windows/Android; limites de capacidade medidos para o lote piloto; termos, privacidade e suporte preparados para revisão antes da oferta. |
| 7/7 — Asaas Produção e liberação | 10 | Conta recebedora conferida; API key e token de webhook exclusivos de Produção no backend; endpoints, eventos, fila e agendador com ambiente correto; cobrança real controlada autorizada, recebimento e acesso comprovados; aprovação explícita do lote beta e acompanhamento ativo. |

## Evidência atual e regras de continuidade

- Fundação, restore e primeiro checkout pago Sandbox têm evidência histórica.
  Não contam como comprovação de pagamento de Produção.
- SELECT de 04/10 às 13h35 de Manaus confirmou último heartbeat Sandbox em
  09h29:31, status ok, contadores de falha/revisão iguais a zero. Um único
  registro, já antigo, não comprova regularidade do cron.
- Plano Inicial no banco: 100 centavos. Zero pagamentos de Produção registrados.
  Contratos Sandbox existentes mantêm o preço contratado; mudar o catálogo
  não reajusta automaticamente uma assinatura.
- A política geral do Supabase Auth não é exposta pelo conector de SQL/Lovable.
  Corrigir as telas e as funções da equipe não comprova a recusa de senha fraca
  diretamente no Auth. A configuração e os testes com conta isolada continuam
  sendo um aceite obrigatório de 4/7.
- A homologação financeira continua em standby por decisão do responsável.
  Nenhum teste com dinheiro real, cancelamento ou estorno real é iniciado
  nesta rodada.
- DICOM está adiado até Radiologia funcionar; suas proteções permanecem.
- Nenhuma etapa será encerrada por mocks, teste SQL de metadata sintética ou
  compilação nativa isoladamente. Os testes necessários em aparelhos e no
  provedor precisam de evidência própria.

Os protocolos completos de desempenho/capacidade e Segurança DentalFlow
continuam separados. Os requisitos mínimos acima são gates desta liberação;
não representam certificação de ausência de falhas ou invasões.
