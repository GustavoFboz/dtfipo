# DentalFlow — Pacote de conformidade e contratos do beta 6/8

**Versão de trabalho 11/11/2026. MINUTAS INTERNAS, NÃO PUBLICADAS, NÃO VIGENTES.** O prestador será inicialmente **pessoa física (CPF), sem CNPJ**. Não registrar CPF ou endereço residencial no GitHub; a ficha inicial exige somente nome civil, cidade/UF e e-mail controlado. Verificar obrigações legais de identificação na oferta, inscrição fiscal e tratamento de dados de saúde antes de vender. Este diretório contém os textos para revisão jurídica e segurança, e a documentação técnica necessária para implementá-los sem afirmar conformidade antes de testes, contratos e aprovação.

## Documentos para revisão

1. [Termos de Uso e Contratação SaaS](SAAS-TERMS-DRAFT.md) — quem contrata, recursos, responsabilidades, preços, uso clínico, sigilo, inadimplência, cancelamento, suporte e saída.
2. [Aviso de Privacidade](PRIVACY-NOTICE-DRAFT.md) — profissionais, empresas e pacientes, dados de saúde, bases legais, operadores, direitos, transferências, segurança e retenção.
3. [DPA — Acordo de Tratamento de Dados](DPA-DRAFT.md) — instruções clínica-operador, suboperadores, sigilo, incidentes, exportação e cooperação.
4. [Anexo do Beta/Planos/Suporte](BETA-PILOT-COMMERCIAL-ANNEX-DRAFT.md) — convites, escopo, preços reais, SLA não prometido e interrupção emergencial.
5. [Cookies e Telemetria](COOKIES-AND-TELEMETRY-DRAFT.md) — separar o estritamente necessário do rastreamento opcional, após auditoria.

## Procedimentos e governança

- [Procedimentos de direitos, incidentes, retenção e saída](LGPD-OPERATIONS-RUNBOOK.md)
- [Registro preliminar de operações de dados (ROPA)](ROPA-PRELIMINARY.md)
- [Análise preliminar de impacto (RIPD)](RIPD-PRELIMINARY.md)
- [Mapa de fornecedores, retenção e incidentes](SUPPLIERS-RETENTION-INCIDENT-REGISTER.md)
- [Ficha simples dos dados faltantes](DADOS-PENDENTES-PARA-APROVACAO.md)
- [Plano técnico de aceite por versão/hash](LEGAL-ACCEPTANCE-ROLLOUT.md)
- [Registro de decisão e bloqueadores em JSON](BETA6-LEGAL-APPROVAL-REGISTER.json)
- [Painel de revisão da etapa 6](REVIEW-GATES.md)

## Regras de implantação

**Nunca habilitar em produção antes de advogado/privacidade revisarem**, validar CNPJ, contatos e contrato de fornecedores, publicar documentos aprovados com hash, permitir leitura antes do cadastro, exigir aceite autêntico de representante e aplicar gate de convites/novos checkouts no backend. A existência de minutas no GitHub não satisfaz a etapa 6 do beta.

Status técnico: pacote documental preparado em branch/PR, publicação ainda bloqueada; nenhum cliente aceitou estes textos. O progressivo 4/8 fica inalterado até aceites reais e QA.
