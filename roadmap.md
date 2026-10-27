- [x] Identidade, confirmação, recuperação e mínimo global de senha comprovados em 21/10; fixtures e dados existentes preservados.
- [x] Eventos externos reconciliados e recuperação sem webhook comprovada em 24/10, com Master/MFA real e auditoria.
- [x] Recuperação de criação/edição de casos publicada em 26/10; contrato idempotente, paciente por ID, vínculos transacionais e regressões preservados.
- [x] Uploads e resiliência pelas APIs comprovados; nove reservas históricas liberadas individualmente pela sessão gestora em 27/10, com 1,04 GiB recuperado e arquivos/dados preservados.
- [x] Manutenção de arquivos limitada a um alvo por vez e interrompida ao primeiro erro; 135 testes locais, tipos, build e CI Web aprovados. Restauração limpa desta rodada bloqueada pelo limite do registry; bundle estático de 183 migrações preservado.
- [ ] Autorizar especificamente a troca dos quarenta endereços privados históricos, com cópia e hash verificados. A revisão automática recusou a preparação; nenhum arquivo histórico foi alterado.
- [ ] Completar os demais ciclos financeiros e a preservação do período pago/dados (2.1, 2.2).
- [ ] Homologar acesso, armazenamento, expiração/limpeza offline em 72h e retomada nos aparelhos (2.3, 3.3).
- [ ] Concluir replay financeiro positivo, cenários de sessão restantes e comprovar a origem dos doze pacientes históricos sem empresa (4.2).
- [ ] Concluir e comprovar cancelamento, troca de plano/preço por vigência, downgrade e recuperação após falha (5.2, 5.3).
- [ ] Backup/restauração operacional e rollback (6.2); onboarding e capacidade piloto (6.3); documentos comerciais/privacidade e revisão (6.4).
- [ ] Aprovação comercial final após os demais critérios (7.4).

Contador vigente: **11/23 (47,83%), 12 restantes, 1/7 etapas encerradas**.
Evidência: `docs/saas/evidence/reservation-release-20261027.md`.
