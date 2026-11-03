# DentalFlow — Etapa 3/8: cópia externa cifrada e conferência independente

**Estado comprovado:** proprietário baixou treze ZIPs de case-files e o último objeto do bucket database_export_05_09_26. O verificador Windows identificou **116/116** itens históricos pendentes: 92 com ETag MD5 correspondente, 24 sem digest de origem comparável, 0 ZIPs e itens inválidos. Isto é **conferência local**, não significa restauração, segunda cópia externa confirmada ou publicação autorizada.

## Windows sem usar créditos de IA do Lovable

1. Mantenha os 13 ZIPs e o arquivo restante **juntos em uma pasta privada**, sem misturar outros arquivos. Não apague os originais.
2. Baixe o executável unsigned DentalFlow-Backup-Cifrado.exe do workflow GitHub **DentalFlow Private Offsite ZIP Encryption**. Ele contém somente código e criptografia: nenhum dado pessoal/secret embutido.
3. Escolha a pasta original dos ZIPs e outra pasta-mãe LOCAL de destino para um **novo pacote cifrado**. Reserve espaço livre para nova cópia integral dos ZIPs.
4. Selecione uma pasta realmente independente, **fora de qualquer pasta sincronizada**, para a **nova chave de 32 bytes**. Não é a chave anterior de outubro; nunca envie nenhuma delas ao GitHub, ao Drive, a terceiros ou ao chat. O programa também impede criar chave dentro da pasta dos ZIPs ou da pasta cifrada.
5. Confirme o termo da interface e clique em Criptografar e conferir localmente. O programa aplica AES-256-GCM, nonce aleatório por arquivo e manifesto criptografado; depois relê cada objeto do backup cifrado, checa tag de autenticação, SHA-256 e tamanho. Os nomes dos arquivos não aparecem nos relatórios.
6. Envie **SOMENTE a pasta cifrada** (part-###.dfenc e catalog.dfenc) ao seu Meu Drive privado, pelo navegador ou app Google Drive para desktop. A chave fica exclusivamente fora dessa pasta e do Drive.
7. Após o Drive confirmar upload, baixe uma cópia do pacote cifrado para uma pasta diferente no computador e execute a conferência independente com a chave NOVA. Guarde os recibos de verificação sem PHI. **Somente esse readback externo** comprova que o pacote realmente chegou inteiro ao Drive.
8. A etapa 3/8 continua exigindo conciliar os 592 objetos historicamente preservados com os 116 recuperados, verificar versões e 24 itens sem hash de origem, registrar delta posterior ao snapshot, obter backup consistente do banco atual, realizar restauração conjunta banco+Storage em staging isolado e ensaiar reversão. Nenhum desses requisitos pode ser presumido pelo simples sucesso do ZIP.

## Avisos de segurança

- Os ZIPs inteiros são cifrados sem extrair conteúdo. Nomes originais só ficam dentro do manifesto cifrado. Saída com nomes opacos.
- O pacote não depende das credenciais do Asaas, chave de service_role nem banco; não pode lançar cobranças nem modificar produção.
- A chave nova deve ser protegida em pelo menos dois locais privados **fisicamente separados do Drive**. Sem ela, não há recuperação possível.
- Se a operação falhar, pacote parcial não deve ser usado. Escolha outro destino vazio e execute novamente; não apague os arquivos fonte.
- Correspondência com ETag MD5 não constitui comprovação criptográfica contra alterações maliciosas. Os 24 sem digest de origem precisam de validação da origem e restauração adicional.
- O repositório GitHub é público; NÃO publique ZIPs clínicos, chave, índice, nomes de pacientes ou manifestos em GitHub Actions, Issue, PR ou este chat.
- EXE ainda sem assinatura digital; verifique a origem do artefato GitHub e não desative permanentemente a proteção do Windows.
- Mesmo após cópia externa, o gate comercial beta continua bloqueado até validação de banco, clínica, cobrança, LGPD e rollback.

Rastreamento: issue #241 e docs/saas/BETA-RELEASE-8-EXECUTIONS.json.
