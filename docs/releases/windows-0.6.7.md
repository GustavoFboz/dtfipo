# DentalFlow Windows 0.6.7

Release oficial de estabilização do Desktop.

## Correções
- seleção múltipla da arcada preserva o grupo completo ao combinar Shift + Ctrl/Cmd;
- parâmetros em lote são aplicados a todos os dentes selecionados;
- redefinição de senha de membros pela página Equipe usa o Supabase Auth real;
- alteração de senha restrita a CEO/Administrador Avançado e à própria empresa;
- nova senha é validada de ponta a ponta antes de confirmar sucesso;
- confirmação informa o e-mail canônico usado no login.

## Segurança e escopo
- sem migrations novas;
- sem alteração em RLS;
- sem alteração em checkout, billing, webhooks ou regras SaaS/Asaas;
- build Windows validado por CI antes da publicação;
- gates de regressão Desktop, entitlement, Hub e central de atualizações atualizados para 0.6.7.
