# Dental Flow — Roadmap técnico e ideias futuras

Este arquivo registra melhorias deliberadamente adiadas, decisões técnicas e ideias que não devem se perder entre ciclos de desenvolvimento.

## Fluxo de desenvolvimento

- Novas alterações devem ser desenvolvidas em **branch separada**.
- Revisar/testar antes de integrar na `main`.
- Evitar mudanças diretas na `main`, especialmente em autenticação, RLS, impressão e fluxos clínicos.

## Impressão

### Print Bridge / agente local para impressão silenciosa

**Status:** futuro / planejado.

Criar um pequeno agente local instalado no computador da clínica/laboratório que faça a ponte entre o Dental Flow web e impressoras do sistema operacional.

Objetivos:

- impressão realmente direta: **clicou em Nota → papel sai**;
- eliminar o diálogo nativo do navegador para impressoras USB/sistema;
- suportar impressoras térmicas USB, rede/Wi-Fi e outros modelos instalados no sistema;
- manter o navegador sem permissões excessivas;
- permitir seleção persistente da impressora por dispositivo/conta;
- expor ao Dental Flow somente uma API local mínima e autenticada;
- manter fallback para impressão convencional e Bluetooth direto quando o agente não estiver disponível.

Primeiro equipamento real de referência: **Tomate MDK-2054N**, sem tornar a implementação dependente desse modelo.

### Perfis de impressora

Evoluir a biblioteca de perfis conhecidos para sugerir automaticamente DPI, largura máxima e presets adequados quando o modelo puder ser identificado com segurança.

## Guia Rápido do Caso

### Papel contínuo

Implementado inicialmente na branch `feature/case-note-continuous-qr`: largura configurável e altura calculada a partir do conteúdo real antes da impressão.

### QR Code do caso

O QR deve sempre representar um deep link autenticado do caso. A autorização nunca é concedida pelo QR: o banco/RLS continua sendo a fonte de verdade. Usuários sem sessão devem autenticar; usuários sem vínculo/permissão não podem receber os dados do caso.
