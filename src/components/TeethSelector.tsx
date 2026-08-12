import { useEffect, useRef } from "react";
import type { MouseEvent } from "react";
import svgRawSource from "@/assets/arcada.svg?raw";

// Strip the black outline from the raw source (safety; new SVG has none).
const svgRaw = svgRawSource;

type Props = {
  value: number[];
  onChange: (next: number[]) => void;
  highlight?: { zirconia?: number[]; dissilicato?: number[]; enceramentoOnly?: number[] };
  implantTeeth?: number[];
  implantColor?: string;
  /** "work" = arcada de trabalhos (padrão). "implant" = arcada de implante. */
  mode?: "work" | "implant";
  /**
   * Mostra a camada de círculos de implante. Deve ser `true` apenas quando o
   * caso tem ao menos um sistema de implante definido. Sem isso, todos os
   * círculos ficam 100% transparentes.
   */
  showImplantLayer?: boolean;
  /** Clique em um dente da arcada de implante (só dentes já em `implantTeeth`). */
  onImplantToothClick?: (tooth: number, anchorRect?: DOMRect) => void;
  /** Mapa dente → cor do sistema (para múltiplos sistemas por caso). */
  implantSystemColors?: Record<number, string>;
  /** Dente atualmente "focado" no painel de implantes (destaque colorido). */
  focusedImplantTooth?: number | null;
  /** Dentes em configuração (painel de trabalho aberto) — pintados em rosa. */
  configuredTeeth?: number[];
  /**
   * Dentes que possuem alguma configuração (case type, material ou implante).
   * Um dente que está em `value` mas NÃO está aqui é renderizado como "off"
   * (não recebe a cor azul de destaque).
   */
  assignedTeeth?: number[];
  /** Dentes com implante que ainda não têm componente apontado (pontinho vermelho). */
  pendingImplantTeeth?: number[];
  /** Clique em um dente pendente de apontamento (ativo mesmo com disabled). */
  onPendingImplantClick?: (tooth: number) => void;
  onWorkClick?: (tooth: number, mods: { ctrl: boolean; shift: boolean }) => void;
  disabled?: boolean;
  compact?: boolean;
  /** Faz o SVG preencher a altura do container pai (útil para layouts sem scroll). */
  fitParent?: boolean;
};


// Implant marker color scale (by implant-system order, NOT by type).
export const IMPLANT_COLOR_SCALE = [
  "#1F8AFF", // 1º — azul
  "#9CA3AF", // 2º — cinza
  "#F59E0B", // 3º — amarelo
  "#10B981", // 4º — verde
  "#A855F7", // 5º — roxo
  "#EF4444", // 6º — vermelho
  "#06B6D4", // 7º — ciano
  "#EC4899", // 8º — rosa
  "#F97316", // 9º — laranja
  "#84CC16", // 10º — lima
];

// Clinical palette
const COLOR_OFF_FILL = "#FFFFFF";
const COLOR_OFF_TEXT = "#828C9A";
const COLOR_HOVER_FILL = "#DCEBFE";
const COLOR_ON_FILL = "#0C84FA";
const COLOR_ON_TEXT = "#FFFFFF";
const COLOR_ZIR_FILL = "#B319E6";
const COLOR_ZIR_TEXT = "#FFFFFF";
const COLOR_DIS_FILL = "#FF8300";
const COLOR_DIS_TEXT = "#FFFFFF";
// Enceramento sozinho (sem tipo primário): verde tiffany
const COLOR_ENC_FILL = "#5EEAD4";
const COLOR_ENC_TEXT = "#083F3A";

// Work-mode implant marker (on selected teeth): black at 60%
const WORK_IMPLANT_FILL = "#000000";
const WORK_IMPLANT_ALPHA = 0.6;

// "Em configuração" (painel do dente aberto)
const CONFIG_BODY = "#FFBABA";
const CONFIG_TEXT = "#FFFFFF";
const CONFIG_IMPLANT = "#FF7070";

// Implant-mode palette (strict spec)
const IMP_OFF_BODY = "#F4F4F4";
const IMP_OFF_DIGIT = "#F4F4F4";
const IMP_OFF_CIRCLE = "#EBEBEB";
const IMP_ON_BODY = "#FFFFFF";
const IMP_ON_DIGIT = "#FFFFFF";
const IMP_SELECTABLE_ALPHA = 0.4;

const VALID_TEETH = new Set([
  11, 12, 13, 14, 15, 16, 17, 18,
  21, 22, 23, 24, 25, 26, 27, 28,
  31, 32, 33, 34, 35, 36, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48,
]);

function parseToothNumber(id: string): number | null {
  const decoded = id.replace(/_x[0-9a-f]{4}_/gi, " ");
  const matches = decoded.match(/\d+/g) ?? [];
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const n = parseInt(matches[i], 10);
    if (VALID_TEETH.has(n)) return n;
  }
  return null;
}

function decodeSvgId(id: string): string {
  return id.replace(/_x[0-9a-f]{4}_/gi, " ").replace(/[_-]+/g, " ").toLowerCase();
}

function isSignalId(id: string): boolean {
  return decodeSvgId(id).includes("sinal");
}

function isRedLikeFill(fill: string | null | undefined): boolean {
  if (!fill || fill === "none") return false;
  const normalized = fill.trim().toLowerCase();
  if (["red", "#f00", "#ff0000", "#ef4444", "#e31e24", "#ed1c24", "#ff1f2d"].includes(normalized)) {
    return true;
  }
  const rgb = normalized.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
  if (!rgb) return false;
  const [, rRaw, gRaw, bRaw, aRaw] = rgb;
  const r = Number(rRaw);
  const g = Number(gRaw);
  const b = Number(bRaw);
  const a = aRaw === undefined ? 1 : Number(aRaw);
  return a > 0 && r >= 180 && g <= 80 && b <= 80;
}

function redLikePaintValues(el: SVGElement): string[] {
  const computed = window.getComputedStyle(el);
  return [
    el.getAttribute("fill"),
    el.getAttribute("stroke"),
    el.style.fill,
    el.style.stroke,
    computed.fill,
    computed.stroke,
  ].filter((paint): paint is string => Boolean(paint));
}

function hasRedLikePaint(el: SVGElement): boolean {
  return redLikePaintValues(el).some(isRedLikeFill);
}

function isNativeSignalShape(el: SVGElement, toothGroup: SVGGElement): boolean {
  if (isSignalId(el.id)) return true;
  const tag = el.tagName.toLowerCase();
  if (!["path", "polygon", "circle", "ellipse", "rect"].includes(tag)) return false;
  if (!hasRedLikePaint(el)) return false;

  try {
    const toothBox = toothGroup.getBBox();
    const box = (el as SVGGraphicsElement).getBBox();
    const toothArea = Math.max(1, toothBox.width * toothBox.height);
    const area = box.width * box.height;
    return area > 0 && area <= toothArea * 0.08;
  } catch {
    return true;
  }
}

function nativeSignalElements(toothGroup: SVGGElement): SVGElement[] {
  const elements = new Set<SVGElement>();
  toothGroup.querySelectorAll<SVGElement>("[id], path, polygon, circle, ellipse, rect").forEach((el) => {
    if (!isNativeSignalShape(el, toothGroup)) return;
    elements.add(el);
    el.querySelectorAll<SVGElement>("path, polygon, circle, ellipse, rect, text, tspan").forEach((child) => {
      elements.add(child);
    });
  });
  return Array.from(elements);
}

const ARCH_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const ARCH_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
function archOf(n: number): number[] {
  return n < 30 ? ARCH_UPPER : ARCH_LOWER;
}

export function TeethSelector({
  value,
  onChange,
  highlight,
  implantTeeth,
  implantColor,
  implantSystemColors,
  mode = "work",
  showImplantLayer,
  onImplantToothClick,
  focusedImplantTooth,
  configuredTeeth,
  assignedTeeth,
  pendingImplantTeeth,
  onPendingImplantClick,
  onWorkClick,
  disabled,
  compact,
  fitParent,
}: Props) {


  const ref = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const disabledRef = useRef(disabled);
  const modeRef = useRef(mode);
  const implantTeethRef = useRef(implantTeeth);
  const onImplantClickRef = useRef(onImplantToothClick);
  const onWorkClickRef = useRef(onWorkClick);
  const pendingRef = useRef(pendingImplantTeeth);
  const onPendingClickRef = useRef(onPendingImplantClick);
  const anchorRef = useRef<number | null>(null);
  const maxHeight = compact ? 640 : 820;

  valueRef.current = value;
  onChangeRef.current = onChange;
  disabledRef.current = disabled;
  modeRef.current = mode;
  implantTeethRef.current = implantTeeth;
  onImplantClickRef.current = onImplantToothClick;
  onWorkClickRef.current = onWorkClick;
  pendingRef.current = pendingImplantTeeth;
  onPendingClickRef.current = onPendingImplantClick;


  useEffect(() => {
    if (!ref.current) return;
    const selected = new Set(value);
    const zir = new Set(highlight?.zirconia ?? []);
    const dis = new Set(highlight?.dissilicato ?? []);
    const enc = new Set(highlight?.enceramentoOnly ?? []);
    const imp = new Set(implantTeeth ?? []);
    const conf = new Set(configuredTeeth ?? []);
    const pending = new Set(pendingImplantTeeth ?? []);
    const assigned = new Set(assignedTeeth ?? value);
    const layerOn = Boolean(showImplantLayer);
    const markerColor = implantColor ?? IMPLANT_COLOR_SCALE[0];
    const isImplantMode = mode === "implant" && layerOn;

    const svg = ref.current.querySelector<SVGSVGElement>("svg");
    if (svg) {
      svg.removeAttribute("width");
      svg.removeAttribute("height");
      svg.style.width = "100%";
      svg.style.height = "auto";
      svg.style.maxWidth = "100%";
      svg.style.maxHeight = fitParent ? "100%" : `${maxHeight}px`;
      svg.style.margin = "0 auto";
      svg.style.display = "block";
      svg.style.overflow = "visible";
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      // Recorta o viewBox ao conteúdo real (remove folgas do arquivo) para maximizar a arcada
      if (!svg.dataset.viewboxFitted) {
        try {
          const bb = (svg as any).getBBox?.();
          if (bb && bb.width > 0 && bb.height > 0) {
            const padX = 0;
            const padY = 0;
            svg.setAttribute(
              "viewBox",
              `${bb.x} ${bb.y} ${bb.width} ${bb.height}`,
            );
            svg.dataset.viewboxFitted = "1";
          }
        } catch {
          /* getBBox may throw se ainda não renderizado; ignore */
        }
      }
      svg.querySelectorAll<SVGElement>("*").forEach((el) => {
        if (isSignalId(el.id) || hasRedLikePaint(el)) return;
        el.style.stroke = "none";
        el.style.strokeWidth = "0";
      });
    }


    const groups = ref.current.querySelectorAll<SVGGElement>("g[id]");
    groups.forEach((g) => {
      if (isSignalId(g.id)) return;
      const n = parseToothNumber(g.id);
      if (n === null) return;

      // Locate the built-in implant circle inside this tooth group.
      const implantEl = g.querySelector<SVGElement>('[id^="Implante" i], [id^="implante" i]');
      const signalEls = nativeSignalElements(g);
      const signalSet = new Set(signalEls);

      // Tooth body & digits
      const bodyEls: SVGElement[] = [];
      const digitEls: SVGElement[] = [];
      g.querySelectorAll<SVGElement>("path, polygon, circle, ellipse, rect, text, tspan").forEach((el) => {
        if (implantEl && el === implantEl) return;
        if (signalSet.has(el)) return;
        const tag = el.tagName.toLowerCase();
        const idLower = (el.id || "").toLowerCase();
        const isDigit =
          el.classList.contains("fil3") ||
          el.classList.contains("fil4") ||
          idLower.startsWith("numero") ||
          tag === "text" || tag === "tspan";
        const isBody =
          el.classList.contains("fil1") ||
          idLower.startsWith("basedente") ||
          (idLower.startsWith("dente") && tag !== "g");
        if (isDigit) digitEls.push(el);
        else if (isBody) bodyEls.push(el);
      });

      // Defaults (theme-aware para tema escuro no estilo "padrão")
      const rootEl = typeof document !== "undefined" ? document.documentElement : null;
      const isDark = !!rootEl?.classList.contains("dark");
      const arcadaStyle = rootEl?.getAttribute("data-arcada") || "padrao";
      const darkDefault = isDark && arcadaStyle !== "azul";
      const DARK_BODY = "#4D4D4D";
      const DARK_DIGIT = "#BDBDBD";
      const DARK_IMPLANT = "#BDBDBD";
      let bodyFill = darkDefault ? DARK_BODY : COLOR_OFF_FILL;
      let digitColor = darkDefault ? DARK_DIGIT : COLOR_OFF_TEXT;
      let implantFill = darkDefault ? DARK_IMPLANT : "#FFFFFF";
      let implantAlpha = 0;

      let cursor: "pointer" | "default" = disabled ? "default" : "pointer";
      let interactive = !disabled;

      // Cor específica do sistema deste dente (multi-sistemas), se houver.
      const perToothImplantColor = implantSystemColors?.[n];
      // Cor do "material" daquele dente (usada como cor do implante)
      const toothMaterialColor =
        dis.has(n) ? COLOR_DIS_FILL :
        zir.has(n) ? COLOR_ZIR_FILL :
        (perToothImplantColor ?? markerColor);

      if (isImplantMode) {
        // Modo Arcada de Implante
        const inCase = selected.has(n);
        const isImplant = imp.has(n);
        if (!inCase) {
          bodyFill = darkDefault ? DARK_BODY : IMP_OFF_BODY;
          digitColor = darkDefault ? DARK_DIGIT : IMP_OFF_DIGIT;
          implantFill = darkDefault ? DARK_IMPLANT : IMP_OFF_CIRCLE;
          implantAlpha = 1;
          cursor = "default";
          interactive = false;

        } else if (isImplant) {
          bodyFill = IMP_ON_BODY;
          digitColor = IMP_ON_DIGIT;
          implantFill = toothMaterialColor;
          implantAlpha = 1;
        } else {
          // Selecionável: círculo na cor do material do dente a 40%.
          bodyFill = IMP_ON_BODY;
          digitColor = IMP_ON_DIGIT;
          implantFill = toothMaterialColor;
          implantAlpha = IMP_SELECTABLE_ALPHA;
        }
      } else {
        // Modo Arcada de Trabalho
        let isSelectedTooth = false;
        if (zir.has(n)) { bodyFill = COLOR_ZIR_FILL; digitColor = COLOR_ZIR_TEXT; isSelectedTooth = true; }
        else if (dis.has(n)) { bodyFill = COLOR_DIS_FILL; digitColor = COLOR_DIS_TEXT; isSelectedTooth = true; }
        else if (enc.has(n)) { bodyFill = COLOR_ENC_FILL; digitColor = COLOR_ENC_TEXT; isSelectedTooth = true; }
        else if (selected.has(n) && assigned.has(n)) { bodyFill = COLOR_ON_FILL; digitColor = COLOR_ON_TEXT; isSelectedTooth = true; }
        else if (imp.has(n)) {
          // Dente marcado só como implante (sem material/case type): pinta como
          // um dente selecionado usando a cor do sistema de implante, para
          // mantê-lo visível na arcada de trabalho.
          bodyFill = perToothImplantColor ?? markerColor;
          digitColor = COLOR_ON_TEXT;
          isSelectedTooth = true;
        }
        // Círculo do implante (#000 60%) em qualquer dente marcado como implante.
        if (layerOn && imp.has(n)) {
          implantFill = WORK_IMPLANT_FILL;
          implantAlpha = WORK_IMPLANT_ALPHA;
        }
        // Override: dente em configuração (painel aberto) fica rosa.
        if (conf.has(n)) {
          bodyFill = CONFIG_BODY;
          digitColor = CONFIG_TEXT;
          isSelectedTooth = true;
          if (layerOn && imp.has(n)) {
            implantFill = CONFIG_IMPLANT;
            implantAlpha = 1;
          }
        }
      }

      // Usa exclusivamente os elementos nativos do SVG marcados como "Sinal"
      // ou pequenos elementos vermelhos já inseridos dentro do grupo do dente.
      signalEls.forEach((el) => {
        if (pending.has(n)) {
          el.removeAttribute("display");
          el.style.display = "";
          el.style.visibility = "visible";
          el.style.opacity = "1";
          el.style.fillOpacity = "1";
          el.style.strokeOpacity = "1";
          el.style.fill = "#FF0000";
          el.style.stroke = "#FF0000";
        } else {
          el.style.opacity = "0";
          el.style.fillOpacity = "0";
          el.style.strokeOpacity = "0";
        }
        el.style.pointerEvents = "none";
        el.style.transition = "none";
      });

      // Se há pendência e um handler foi fornecido, o dente é sempre clicável
      // (mesmo em disabled), para abrir o seletor de componente.
      if (pending.has(n) && onPendingClickRef.current) {
        cursor = "pointer";
        interactive = true;
      }



      // Preserva o hover: se o cursor está sobre este dente (não selecionado) no
      // momento em que o efeito reexecuta, mantém o fill de hover em vez de
      // resetar para OFF — evita o "piscar" azul-claro sob o cursor.
      const isHighlighted =
        zir.has(n) || dis.has(n) || enc.has(n) || (selected.has(n) && (assigned.has(n) || conf.has(n)));
      const canHover = !isImplantMode && !disabled && !isHighlighted;
      let hovering = false;
      if (canHover) {
        try { hovering = g.matches(":hover"); } catch { hovering = false; }
      }
      const finalBodyFill = hovering ? COLOR_HOVER_FILL : bodyFill;

      bodyEls.forEach((el) => {
        el.style.setProperty("fill", finalBodyFill, "important");
        el.style.transition = "none";
      });
      digitEls.forEach((el) => {
        el.style.setProperty("fill", digitColor, "important");
        el.style.transition = "none";
      });
      if (implantEl) {
        implantEl.style.setProperty("fill", implantFill, "important");
        implantEl.style.setProperty("fill-opacity", String(implantAlpha), "important");
        implantEl.style.transition = "none";
        implantEl.style.pointerEvents = "none";
      }

      g.style.cursor = cursor;
      g.style.pointerEvents = interactive ? "all" : "none";
      g.setAttribute("data-tooth", String(n));

      // Hover only in work mode for unselected teeth
      g.onmouseenter = null;
      g.onmouseleave = null;
      if (canHover && interactive) {
        g.onmouseenter = () => {
          bodyEls.forEach((el) => { el.style.setProperty("fill", COLOR_HOVER_FILL, "important"); });
        };
        g.onmouseleave = () => {
          bodyEls.forEach((el) => { el.style.setProperty("fill", bodyFill, "important"); });
        };
      }
    });
  }, [value, highlight, disabled, maxHeight, implantTeeth, implantColor, implantSystemColors, mode, showImplantLayer, focusedImplantTooth, configuredTeeth, assignedTeeth, pendingImplantTeeth]);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as Element | null;
    // Sobe pela árvore procurando o PRIMEIRO ancestral cujo id represente
    // um número FDI válido. Sem isso, cliques em sub-grupos com id (como
    // <g id="Sinal_...">, <g id="Implante_...">, etc.) devolvem `null` e
    // o clique é silenciosamente descartado.
    let group: SVGGElement | null = target?.closest<SVGGElement>("g[id]") ?? null;
    let n: number | null = null;
    while (group && ref.current?.contains(group)) {
      n = parseToothNumber(group.id);
      if (n !== null) break;
      group = group.parentElement?.closest<SVGGElement>("g[id]") ?? null;
    }
    if (!group || n === null) return;

    // Clique em dente de implante: abre o seletor (pendente OU já com componente escolhido,
    // desde que não esteja no modo de marcação de implantes).
    const _pendSet = new Set(pendingRef.current ?? []);
    const _impSet = new Set(implantTeethRef.current ?? []);
    if (
      onPendingClickRef.current &&
      (_pendSet.has(n) || (modeRef.current !== "implant" && _impSet.has(n)))
    ) {
      onPendingClickRef.current(n);
      return;
    }

    if (disabledRef.current) return;


    // Implant mode: any tooth already in the case (value) can be toggled as implant.
    if (modeRef.current === "implant") {
      const inCase = new Set(valueRef.current);
      if (!inCase.has(n)) return;
      // Prefer o círculo do implante como âncora; fallback = grupo do dente.
      const implantEl = group.querySelector<SVGElement>('[id^="Implante" i], [id^="implante" i]');
      const anchorEl = (implantEl ?? group) as SVGGraphicsElement;
      const rect = anchorEl.getBoundingClientRect();
      onImplantClickRef.current?.(n, rect);
      return;
    }

    // Work mode: if parent provided an onWorkClick handler, delegate entirely.
    if (onWorkClickRef.current) {
      onWorkClickRef.current(n, { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey });
      anchorRef.current = n;
      return;
    }

    // Work mode: original toggle/range logic
    const s = new Set(valueRef.current);
    const anchor = anchorRef.current;
    if (event.shiftKey && anchor !== null && Math.floor(anchor / 30) === Math.floor(n / 30)) {
      const arch = archOf(n);
      const a = arch.indexOf(anchor);
      const b = arch.indexOf(n);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        for (let i = lo; i <= hi; i += 1) s.add(arch[i]);
        anchorRef.current = n;
        onChangeRef.current(Array.from(s));
        return;
      }
    }
    if (s.has(n)) s.delete(n);
    else s.add(n);
    anchorRef.current = n;
    onChangeRef.current(Array.from(s));
  };

  return (
    <div className={`select-none w-full ${fitParent ? "h-full min-h-0 flex" : ""}`}>
      <div
        ref={ref}
        className={`mx-auto flex w-full max-w-[860px] justify-center p-0 ${fitParent ? "h-full min-h-0 items-center" : ""}`}
        onClick={handleClick}
        dangerouslySetInnerHTML={{ __html: svgRaw }}
      />
    </div>

  );
}
