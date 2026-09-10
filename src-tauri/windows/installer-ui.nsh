; DentalFlow 0.4.0 — UI do instalador
; Mantemos o motor NSIS/Tauri para confiabilidade, porém a apresentação segue
; a interface do produto: fundo claro, tipografia fina do Windows, azul DentalFlow
; e linguagem integralmente em português.

!define MUI_FONT "Segoe UI"
!define MUI_FONTSIZE "9"
!define MUI_BGCOLOR "FFFFFF"
!define MUI_TEXTCOLOR "172033"
!define MUI_INSTFILESPAGE_COLORS "66758A FFFFFFFF"
!define MUI_WELCOMEPAGE_TITLE_3LINES
!define MUI_FINISHPAGE_TITLE_3LINES

; Textos deliberadamente curtos, leves e sem jargão técnico.
!define MUI_WELCOMEPAGE_TITLE "Bem-vindo ao DentalFlow"
!define MUI_WELCOMEPAGE_TEXT "Vamos preparar o DentalFlow neste computador.$\r$\n$\r$\nA instalação é rápida e mantém seus dados e preferências do aplicativo preservados.$\r$\n$\r$\nSelecione Avançar para continuar."
!define MUI_FINISHPAGE_TITLE "DentalFlow está pronto"
!define MUI_FINISHPAGE_TEXT "A instalação foi concluída com sucesso.$\r$\n$\r$\nVocê já pode abrir o DentalFlow e continuar seu trabalho."
!define MUI_ABORTWARNING

; Hooks vazios são intencionais: este arquivo é carregado antes das páginas MUI
; pelo template oficial do Tauri e funciona também como folha de estilo NSIS.
!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Preparando o DentalFlow..."
!macroend

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "DentalFlow instalado com sucesso."
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Preparando a remoção do DentalFlow..."
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DetailPrint "DentalFlow removido deste computador."
!macroend
