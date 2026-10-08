# Diagnóstico somente leitura — checkout AS Lab, 28/09/2026 04:39 UTC

## Causas verificadas
- O banco consultado tem a empresa **AS Lab**, mas nenhum perfil de cobrança nem cliente Asaas vinculado a ela. Seus dois checkouts visíveis são antigos (09/09), pendentes e sem cliente, assinatura ou pagamento externo registrados.
- O perfil fiscal denominado **DentalFlow Homologação Sandbox** existe nesse banco, porém está vinculado a outra empresa com esse nome, não à AS Lab. Portanto, ver o nome do perfil na interface não comprova que a AS Lab tenha um perfil salvo.
- Há um checkout novo às **04:38:57 UTC** para **DentalFlow Homologação Sandbox**, não para AS Lab. Permanece pendente e sem identificadores externos. Não há operação de provisionamento registrada desde 03:00 UTC; a última operação registrada é de 26/09.
- Os logs disponíveis mostram uma chamada `POST` de função da aplicação às **04:38:58 UTC** em `preview--dtfipo.lovable.app`, com HTTP **200 do transporte**. Não aparece uma chamada de checkout no endereço publicado no mesmo intervalo. Esse 200 **não é o status do Asaas nem confirma sucesso do checkout**: a função devolve erros de negócio dentro do corpo da resposta.
- A mensagem “O Asaas não aceitou a preparação da cobrança” é genérica para códigos que começam por `ASAAS_`. O código interno específico, o status HTTP do Asaas e a etapa (customers/subscriptions/payments) **não constam dos logs disponíveis**. A implementação registra no servidor somente erros normalizados com status >= 500; os demais são devolvidos no corpo da chamada. A consulta de logs da API/Cloud não retornou entradas para esse horário.

## Limites e hipóteses
- A consulta de banco e a interface podem estar apontando para ambientes Test/Live diferentes, mas isso **não foi demonstrado**: no banco acessível há um registro exatamente no horário do clique, ligado à empresa cujo nome coincide com o perfil exibido. A hipótese mais forte é seleção/contexto de empresa diferente de AS Lab; é preciso confirmar o identificador da empresa efetivamente selecionada na interface, sem exibir dados pessoais.
- A falta de operações e vínculos no banco consultado sugere falha antes de `customer_ensure` **nesse banco**, mas não prova que nenhum recurso foi criado no Asaas ou em outro ambiente. Não repetir a tentativa até confirmar o resultado externo se houver suspeita de escrita ambígua.

## Próximo ajuste mínimo (não aplicado)
- Na mesma tentativa, capturar de forma segura o campo `code` e o `status` retornados pela função de checkout e correlacioná-los ao identificador do checkout e à empresa selecionada. Comparar, sem revelar valores privados, a identidade do banco usada pela interface e pela consulta (Test/Live). Se a falha anteceder a operação, corrigir apenas o contexto de empresa/perfil que gera o checkout; se for rejeição do Asaas, tratar o código e a etapa exatos antes de alterar dados ou repetir pagamento.

Nenhum código, banco ou configuração foi alterado; nenhum pagamento foi executado. Não houve publicação.
