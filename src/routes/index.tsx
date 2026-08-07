import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      // @ts-ignore
      throw redirect({ to: "/lab" });
    }
    // @ts-ignore
    throw redirect({ to: "/lp" });
  },
  component: () => (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md space-y-4 rounded-2xl border border-border bg-card p-8 shadow-lg">
        <h1 className="text-xl font-semibold">DentalFlow Pro</h1>
        <p className="text-muted-foreground whitespace-pre-wrap text-sm leading-relaxed">
          Execute esta instrucao no projeto: me referia aos seguintes :

n1 - mudar em todo o sistema : confecção para elementos (até mesmo na aba de detalhes do caso)

n2 - ajustar botão "anexar" no chat do caso, para ao clicar nele, abrir um dropdown com opções de anexar : -Arquivos de(antes de todos : ex: arquivos de imagem, arquivos de modelos)- : Imagem (subopção de adicionar à galeria do caso ou apenas ao chat, de forma simples e direta, sem muita enrolação), escaneamentos, html, modelos, Elementos

cada opção do dropdown deve carregar apenas itens aceitos nas respectivas abas, e, ao serem carregados no chat, incluir uma "miniatura" do anexo, com link direto para o item na respectiva aba (pré-selecionando o item indicado para localização visual pelo usuário), em caso de imagem, a miniatura deve ser a visualização da própria imagem. de resto, pode ficar uma mensagem de corpo personalizado com (titulo pequeno : [tipo, ex : modelo]; nome do arquivo (um pouco maior) : [nome do arquivo carregado com a extensao no final ex: modelo_dente_45.stl]; tamanho do arquivo(menor que o nome) [medida em kb, mb, gb ex : 24mb] e um ícone para cada tipo de anexo (essa sera a miniatura de arquivos que não sejam imagens)

imagens podem ser visualizadas no visualizador de imagem ao clicar na miniatura de imagem.

n4 Checklists no chat: FAB no canto do chat com contador de itens pendentes, dropdown quando há mais de um checklist, criação com predefinições salvas (reutilizáveis), marcação por qualquer usuário e registro centralizado no chat a cada check/uncheck.
n5 Cores de dente: escala completa (A1–D4, BL1–BL4) já disponível na abertura/edição de caso.
n6 Resinas por kg: nova página Estoque → “Resinas (kg)” com cadastro de potes (marca, tipo, cor, validade, conteúdo declarado, mínimo), tara informada uma única vez e pesagens com desconto automático da tara — digitando o peso ou conectando a balança via Bluetooth, com histórico e alerta de mínimo.
n7 Consumo por implante: regras de consumo agora têm “Qtd por implante”, multiplicada pelo número de implantes do caso na etapa-gatilho (o registro manual por dente de implante continua disponível).

Analise cada uma e garanta ou faça um plano de ação para aplicar tudo 100 sejam quantas edições e forem necessarias usando o maximo da capacidade por resposta
        </p>
      </div>
    </div>
  ),
});
