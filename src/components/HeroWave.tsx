/**
 * HeroWave — curva Bézier suave e simétrica que separa uma seção superior
 * (imagem/cor sólida) de um painel branco inferior. Usa preserveAspectRatio="none"
 * para escalar em qualquer largura sem deformar. Deve ser posicionada absolutamente
 * "invadindo" a área da imagem em ~50px.
 *
 * Uso:
 *   <div className="relative">
 *     <img className="w-full h-[60vh] object-cover" />
 *     <HeroWave className="absolute bottom-0 inset-x-0" fill="#ffffff" />
 *   </div>
 *   <div className="bg-white">...conteúdo...</div>
 */
export function HeroWave({
  className = "",
  fill = "#ffffff",
  height = 80,
}: {
  className?: string;
  fill?: string;
  height?: number;
}) {
  return (
    <svg
      viewBox="0 0 1440 120"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      style={{ height, width: "100%", display: "block" }}
    >
      {/* Arco simétrico: painel branco com topo em dome, invadindo a imagem. */}
      <path
        d="M0,120 L0,55 Q720,-35 1440,55 L1440,120 Z"
        fill={fill}
      />
    </svg>
  );
}
