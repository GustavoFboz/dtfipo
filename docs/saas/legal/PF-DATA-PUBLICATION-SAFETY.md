# DentalFlow — Protocolo de identificação PF sem divulgação prematura

**11/11/2026 — registro público sem dados pessoais. NÃO É AUTORIZAÇÃO PARA PUBLICAR OU COBRAR.**

O repositório `GustavoFboz/dtfipo` possui visibilidade **pública**. A modalidade escolhida para a prestação inicial do SaaS é pessoa física (CPF), sem CNPJ. A ficha inicial solicitava nome civil, município/UF e e-mail de suporte/privacidade; essas informações foram fornecidas pelo responsável **fora do repositório**, mas **não foram verificadas** como identificação fiscal nem como titularidade de contato.

## Segurança de elaboração

1. **Nunca gravar em Git, PRs, issues, ações, fixtures ou logs públicos:** CPF, RG, foto de documento, endereço residencial completo, contas bancárias, credenciais Asaas, informações clínicas, chaves, senhas ou e-mail pessoal ainda não aprovado para divulgação.
2. **Nome civil e e-mail indicado:** conservar somente em uma ficha privada de identificação do prestador, separada das minutas no repositório. Não copiar dados reais a `docs/saas/legal/` antes de autorização de divulgação e revisão da obrigação de identificação na oferta e da proteção de privacidade.
3. **Publicação futura:** obter consentimento/decisão explícita sobre qual contato efetivamente será público; verificar legislação consumerista e tributária aplicável ao serviço de pessoa física, habilitação e dados exibidos no checkout e exigências municipais. A necessidade de informar identificação/endereço legalmente não pode ser evitada por redigir o contrato.
4. **Versões:** preencher e assinar somente textos aprovados; verificar hash, exibir antes da contratação, manter recibos imutáveis de representante autorizado e vincular valor/ciclo. Separar ciência da privacidade, aceitação B2B e hipótese legal dos dados de pacientes.
5. **Revisão antes de merge/deploy:** comparar alterações públicas contra padrões de documentos, e-mails pessoais e CPFs; usar testes com pessoas fictícias. Nunca usar dados clínicos e CPF reais em CI. Remover um segredo de um commit posterior não o apaga do histórico público.

**Situação atual:** dados iniciais de perfil PF recebidos por canal privado; e-mail e identidade não verificados; minuta sem publicação, etapa 6 pendente e painel 4/8. Não criar conta, cobrança ou aceite automaticamente.
