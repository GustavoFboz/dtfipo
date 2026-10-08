# Validação Auth com duas contas fictícias mantidas

## Evidência atual
- O endpoint do Auth respondeu HTTP 200: e-mail/senha e cadastro estão habilitados; confirmação de e-mail é obrigatória (`mailer_autoconfirm=false`).
- O endpoint não expõe `password_min_length` nem confirma, sozinho, o fluxo de recuperação.
- O ambiente dispõe de acesso administrativo no backend, e o código existente já cria usuários confirmados com `email_confirm=true`, sem enviar e-mail.

## Execução curta e controlada
1. Criar duas identidades `@example.invalid`, confirmadas administrativamente, com senhas fortes e sem e-mail/SMS.
2. Manter ambas como fixtures permanentes, claramente marcadas para aceite, cada uma em empresa fictícia própria; não vinculá-las à IPO nem a dados existentes.
3. Validar login real pela API pública e tentar senha de sete caracteres em uma fixture. Se o Auth aceitar, restaurar imediatamente a senha forte e registrar que o mínimo global é inferior a oito; se recusar, registrar o código seguro e o mínimo comprovável pelo teste.
4. Validar logout/revogação, recuperação por link administrativo interno sem envio e MFA TOTP pertencente somente à fixture.
5. Validar isolamento entre as duas empresas e o Master temporário: recusa em AAL1, acesso em AAL2 e recusa após remover `platform_operators`. Não tocar em eventos financeiros.
6. Preservar as duas contas ao final, remover apenas permissões Master temporárias e relatar resíduos sanitizados. Interromper a fixture afetada no primeiro erro.

## Limites e segurança
- Nenhuma conta, sessão, autenticador ou dado de Gustavo/IPO/clientes será usado.
- Nenhum Asaas, cobrança, assinatura, Produção, DICOM, publicação ou alteração de código/configuração.
- Recuperação será considerada habilitada somente se o link interno real for emitido e consumido; a configuração pública isolada não basta.
- O resultado prova APIs HTTP do Auth, não os aplicativos instalados.
