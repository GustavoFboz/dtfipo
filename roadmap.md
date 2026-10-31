- [x] Identidade, confirmação, recuperação e mínimo global de senha comprovados em 21/10; fixtures e dados existentes preservados.
- [x] Eventos externos reconciliados e recuperação sem webhook comprovada em 24/10, com Master/MFA real e auditoria.
- [x] Recuperação de criação/edição de casos publicada em 26/10; contrato idempotente, paciente por ID, vínculos transacionais e regressões preservados.
- [x] Uploads e resiliência pelas APIs comprovados; nove reservas históricas liberadas individualmente pela sessão gestora em 27/10, com 1,04 GiB recuperado e arquivos/dados preservados.
- [x] Manutenção de arquivos limitada a um alvo por vez e interrompida ao primeiro erro; 135 testes locais, tipos, build e CI Web aprovados. Restauração limpa desta rodada bloqueada pelo limite do registry; bundle estático de 183 migrações preservado.
- [x] Troca dos quarenta endereços históricos autorizada e concluída em 27/10, 12h42 Manaus: cópias verificadas, origens ausentes, quarenta URLs originais recusadas e conteúdo/vínculos/cotas preservados. Resposta 503 e retomada após expirar a trava conservadas no recibo.
- [x] Preparação isolada do cancelamento Sandbox publicada em 28/10 pela PR204: 17/17 checks reais, um pedido autenticado AWAITING_MASTER, zero escrita financeira, mesmos 700 arquivos e hashes clínicos/financeiros. Confirmar no Master e observar resultado continua pendente.
- [x] Troca de plano/preço por vigência publicada em 28/10 pela PR206: 413 testes, restore limpo de 185 migrações e 18/18 checks reais de observação/autorização. Dados, quatro preços e pedido anterior preservados; zero novos termos ou execuções financeiras. Master/pagamento/aplicação e downgrade reais permanecem pendentes.
- [x] Cancelamento Sandbox A concluído em 28/10, 20h06 Manaus, com Master/autenticador reais, uma escrita e Asaas INACTIVE. Observação 18/18, 701 arquivos, dados, cobranças e período pago preservados; fixture B intacta. Troca/preço e downgrade seguem pendentes para fechar 5.2/5.3.
- [ ] Completar os demais ciclos financeiros e a preservação do período pago/dados (2.1, 2.2).
- [ ] Homologar acesso, armazenamento, expiração/limpeza offline em 72h e retomada nos aparelhos (2.3, 3.3).
- [ ] Concluir replay financeiro positivo, cenários de sessão restantes e comprovar a origem dos doze pacientes históricos sem empresa (4.2).
- [x] Aceite 5.2 concluído em 28/10, 20h48 Manaus: cancelamento A e troca de plano/preço B executados no Asaas Sandbox com Master/MFA reais, uma escrita por pedido e 54/54 verificações reais; período, faturas, ledger e 701 arquivos preservados.
- [ ] Comprovar pagamento/aplicação do downgrade programado para 18/12 UTC, limites nessa vigência e recuperação após falha real ambígua (5.3).
- [ ] Backup/restauração operacional e rollback (6.2); onboarding e capacidade piloto (6.3); documentos comerciais/privacidade e revisão (6.4).
- [ ] Aprovação comercial final após os demais critérios (7.4).

Contador vigente: **13/23 (56,52%), 10 restantes, 1/7 etapas encerradas**. Falta um aceite integral para 14/23 (60,87%).
Evidências: `docs/saas/evidence/reservation-release-20261027.md`, `docs/saas/evidence/private-file-rotation-20261027.md`, `docs/saas/evidence/cancellation-preparation-20261028.md`, `docs/saas/evidence/plan-price-periods-20261028.md` e `docs/saas/evidence/master-plan-change-20261028.md`.
