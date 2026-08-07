import { Link, Outlet, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { PageTransition } from "@/components/PageTransition";
import {
  LayoutDashboard,
  Users,
  Stethoscope,
  LogOut,
  Users2,
  Box,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  ListChecks,
  MoreHorizontal,
  Moon,
  Sun,
  X,
  User,
  Home,
  Bell,
  Search as SearchIcon
} from "lucide-react";
import { Settings as SettingsIcon } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { NotificationPanel } from "./NotificationPanel";
import { GlobalSearch } from "./GlobalSearch";

import { BackupButton } from "./BackupButton";
import { fetchCases, fetchPatients, fetchPendingJoinRequests, fetchProfile, fetchStages } from "@/lib/api";
import { fetchWorkflowSettings, fetchMyTasks, fetchWorkflowStages, fetchAllStageAssignments } from "@/lib/workflow";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Profile } from "@/lib/types";
import { InstallPWAButton } from "./InstallPWAButton";
import { CaseDeepLink } from "./CaseDeepLink";
import { DialogAutoReopen } from "./DialogAutoReopen";
import { useCasesRealtime } from "@/hooks/use-cases-realtime";
import { useEntityRealtime } from "@/hooks/use-entity-realtime";
import { useChatRealtime } from "@/hooks/use-chat-realtime";



const ROLE_LABELS: Record<string, string> = { CEO: "CEO", DR: "Dentista", PROTETICO: "Protético", ATENDIMENTO: "Atendimento", CADISTA: "Cadista", USER: "Usuário" };
const PAGE_EXIT_DURATION_MS = 220;
const PAGE_BLANK_DURATION_MS = 55;
const PAGE_ENTER_DURATION_MS = 300;

const navItems = [
  { to: "/lab", label: "Casos", icon: LayoutDashboard, roles: ["CEO", "DR", "PROTETICO", "ATENDIMENTO"] },
  { to: "/patients", label: "Pacientes", icon: Users, roles: ["CEO", "DR", "ATENDIMENTO"] },
  { to: "/agenda", label: "Agenda", icon: CalendarDays, roles: ["CEO", "DR", "PROTETICO", "ATENDIMENTO", "CADISTA"] },
  { to: "/equipe", label: "Equipe", icon: Users2, roles: ["CEO"] },
  { to: "/estoque", label: "Estoque", icon: Box, roles: ["CEO", "ATENDIMENTO", "PROTETICO"] },
] as const;


function getMobilePageTitle(pathname: string, items: readonly { to: string; label: string }[]): string {
  if (pathname === "/") return "IPO";
  if (pathname === "/lab") return "Laboratório";
  // "/financeiro" removido — módulo desativado.
  const match = items.find((n) => n.to !== "/lab" && pathname.startsWith(n.to));
  if (match) return match.label;
  if (pathname.startsWith("/patients/")) return "Paciente";
  if (pathname.startsWith("/configuracoes")) return "Configurações";
  return "DentalFlow";
}


export function AppShell() {
  useCasesRealtime();
  useChatRealtime();
  // Realtime global: qualquer alteração no banco reflete instantaneamente em todos os clientes.
  useEntityRealtime("patients", ["patients"]);
  useEntityRealtime("doctors", ["doctors"]);
  useEntityRealtime("stock_items", ["stock_items"], {
    patch: [
      ["stock_items_v2"],
      ["stock_items_all"],
      ["implant_stock_items"],
      ["rule_items"],
      ["eligible_items"],
    ],
  });
  useEntityRealtime("stock_movements", ["stock_movements"], {
    invalidate: [["stock_items_v2"], ["stock_items_all"], ["implant_stock_items"], ["stock_items"], ["rule_items"], ["eligible_items"]],
    patch: [],
  });
  useEntityRealtime("case_implant_teeth", ["case_implant_teeth"]);
  useEntityRealtime("case_tooth_stock_usage", ["case_tooth_stock_usage"]);
  useEntityRealtime("case_stock_consumptions", ["case_stock_consumptions"]);

  useEntityRealtime("case_types", ["case_types"]);
  useEntityRealtime("burrs", ["burrs"]);
  useEntityRealtime("components", ["components"]);
  useEntityRealtime("component_categories", ["component_categories"]);
  useEntityRealtime("holders", ["holders"]);
  useEntityRealtime("implant_systems", ["implant_systems"]);
  useEntityRealtime("tooth_colors", ["tooth_colors"]);
  useEntityRealtime("profiles", ["profiles"]);
  useEntityRealtime("user_roles", ["user_roles"]);
  useEntityRealtime("stages", ["stages"], { invalidate: [["workflow_stages"]] });
  useEntityRealtime("phases", ["phases"]);
  useEntityRealtime("stock_consumption_rules", ["stock_consumption_rules"]);
  useEntityRealtime("workflow_settings", ["workflow_settings"]);
  useEntityRealtime("clinic_members", ["clinic_members"]);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState<string | null>(null);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });
  const isAdmin = profile?.role === "CEO" || profile?.role === "DR";
  const { data: pendingRequests = [] } = useQuery({
    queryKey: ["join_requests"],
    queryFn: fetchPendingJoinRequests,
    enabled: isAdmin,
    refetchInterval: 8000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const pendingCount = pendingRequests.length;
  const { data: workflowSettings } = useQuery({ queryKey: ["workflow_settings"], queryFn: fetchWorkflowSettings });
  useQuery({
    queryKey: ["workflow_stages"],
    queryFn: fetchWorkflowStages,
    enabled: !!workflowSettings?.phases_enabled,
    staleTime: 5 * 60_000,
  });
  useQuery({
    queryKey: ["stage_assignments_all"],
    queryFn: fetchAllStageAssignments,
    enabled: !!profile,
    staleTime: 5 * 60_000,
  });
  const { data: myTasks = [] } = useQuery({
    queryKey: ["my_tasks"],
    queryFn: fetchMyTasks,
    enabled: !!profile,
    refetchInterval: 30000,
  });
  const tasksCount = myTasks.length;

  const isCadista = profile?.role === "CADISTA";
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 1280;
  });
  // Auto-collapse em telas menores (<1280) para não invadir o conteúdo.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 1279px)");
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsCollapsed(e.matches);
    handler(mq);
    mq.addEventListener("change", handler as (e: MediaQueryListEvent) => void);
    return () => mq.removeEventListener("change", handler as (e: MediaQueryListEvent) => void);
  }, []);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pageTransitionPhase, setPageTransitionPhase] = useState<"idle" | "exiting" | "blank" | "entering">("idle");
  const [pageTransitionKey, setPageTransitionKey] = useState(0);
  const transitionTargetRef = useRef<string | null>(null);
  const transitionTimeoutsRef = useRef<number[]>([]);
  const { theme, toggleTheme } = useTheme();

  function clearTransitionTimers() {
    for (const id of transitionTimeoutsRef.current) window.clearTimeout(id);
    transitionTimeoutsRef.current = [];
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  useEffect(() => {
    return () => {
      clearTransitionTimers();
    };
  }, []);

  const prevPathnameRef = useRef(pathname);
  useEffect(() => {
    const prev = prevPathnameRef.current;
    prevPathnameRef.current = pathname;
    if (transitionTargetRef.current) return;
    // Só pular a transição global quando o par é exatamente Lab↔Dentes
    // (essas duas rotas usam animações dedicadas entre si). Nos demais casos,
    // Lab entra/sai com a mesma transição das outras páginas do menu.
    const isLab = (p: string) => p.startsWith("/lab");
    const isDentes = (p: string) => p.startsWith("/dentes");
    const isLabDentesPair = (isLab(prev) && isDentes(pathname)) || (isDentes(prev) && isLab(pathname));
    if (isLabDentesPair) return;

    setPageTransitionKey((key) => key + 1);
    setPageTransitionPhase("entering");
    clearTransitionTimers();
    transitionTimeoutsRef.current.push(
      window.setTimeout(() => setPageTransitionPhase("idle"), PAGE_ENTER_DURATION_MS),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);


  function handleAnimatedNavigation(
    event: MouseEvent<HTMLAnchorElement>,
    target: string,
    options?: { closeMobileMenu?: boolean },
  ) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }

    if (options?.closeMobileMenu) setMobileMenuOpen(false);
    if (target === pathname) return;
    // Ignore additional clicks while an exit/blank/entry cycle is in flight.
    if (pageTransitionPhase !== "idle") {
      event.preventDefault();
      return;
    }

    const isLabDentesPair =
      (pathname.startsWith("/lab") && target.startsWith("/dentes")) ||
      (pathname.startsWith("/dentes") && target.startsWith("/lab"));
    if (isLabDentesPair) return;

    event.preventDefault();
    transitionTargetRef.current = target;
    clearTransitionTimers();
    setPageTransitionPhase("exiting");

    transitionTimeoutsRef.current.push(
      window.setTimeout(() => {
        setPageTransitionPhase("blank");
        transitionTimeoutsRef.current.push(
          window.setTimeout(() => {
            Promise.resolve(navigate({ to: target as any }))
              .then(() => {
                if (transitionTargetRef.current !== target) return;
                setPageTransitionKey((key) => key + 1);
                setPageTransitionPhase("entering");
                transitionTimeoutsRef.current.push(
                  window.setTimeout(() => {
                    if (transitionTargetRef.current !== target) return;
                    transitionTargetRef.current = null;
                    setPageTransitionPhase("idle");
                  }, PAGE_ENTER_DURATION_MS),
                );
              })
              .catch(() => {
                transitionTargetRef.current = null;
                setPageTransitionPhase("idle");
              });
          }, PAGE_BLANK_DURATION_MS),
        );
      }, PAGE_EXIT_DURATION_MS),
    );
  }

  // Preload sidebar routes immediately so navigation never keeps the old page
  // visible while route modules are being fetched.
  useEffect(() => {
    for (const n of navItems) router.preloadRoute({ to: n.to }).catch(() => {});
  }, [router]);

  useEffect(() => {
    if (!profile?.role) return;
    // Pré-aquece o cache das rotas principais sem forçar refetch se já houver dados frescos.
    queryClient.prefetchQuery({ queryKey: ["cases", "active"], queryFn: () => fetchCases("active") });
    queryClient.prefetchQuery({ queryKey: ["stages"], queryFn: fetchStages });
    if (["CEO", "DR", "ATENDIMENTO"].includes(profile.role)) {
      queryClient.prefetchQuery({ queryKey: ["patients"], queryFn: fetchPatients });
    }
  }, [profile?.role, queryClient]);


  useEffect(() => {
    const update = () => setDialogOpen(document.body.hasAttribute("data-scroll-locked"));
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.body, { attributes: true, attributeFilter: ["data-scroll-locked"] });
    return () => obs.disconnect();
  }, []);

  async function handleLogout() {
    // Sign-out hygiene: cancela queries em voo, limpa o cache, faz signOut
    // e substitui o histórico para que o Back não restaure a shell protegida.
    const { logAuditEvent } = await import("@/lib/audit");
    await logAuditEvent("auth.logout", { via: "manual" });
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true, search: { invite: undefined, mode: undefined } });
  }

  // Enquanto o profile ainda não chegou, tratamos o email admin como CEO para
  // não deixar a sidebar "vazia" (apenas Configurações) durante o carregamento
  // ou em caso de falha silenciosa no fetchProfile.
  const emailIsAdmin = email?.toLowerCase() === "gustavovitorfa@gmail.com";
  const effectiveRole = profile?.role ?? (emailIsAdmin ? "CEO" : undefined);

  const filteredNavItems = [
    ...navItems.filter(n =>
      !n.roles ||
      effectiveRole === "CEO" ||
      (effectiveRole ? (n.roles as any).includes(effectiveRole) : false)
    ),
    ...(tasksCount > 0 || (workflowSettings?.phases_enabled && profile)
      ? [{ to: "/tarefas", label: "Tarefas", icon: ListChecks, roles: undefined as any }]
      : []),
    ...(workflowSettings?.phases_enabled && (effectiveRole === "CEO" || effectiveRole === "DR")
      ? [{ to: "/fluxo", label: "Fluxo", icon: GitBranch, roles: undefined as any }]
      : []),
    ...(emailIsAdmin
      ? [{ to: "/configuracoes", label: "Configurações", icon: SettingsIcon, roles: undefined as any }]
      : []),
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-[#fcfdfe] dark:bg-black font-light transition-colors duration-500">
      {/* ============ DESKTOP TOP HEADER ============ */}
      <header className="hidden md:flex fixed top-0 right-0 z-50 bg-[#F9FAFB] dark:bg-slate-950 border-b border-slate-100 dark:border-white/5 items-center justify-between px-8 transition-all duration-500 left-0 h-[72px]">
        <div className="flex items-center w-64 px-6 shrink-0 h-full">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-2 -ml-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors shrink-0"
              aria-label="Toggle sidebar"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
              </svg>
            </button>
            
            <Link to="/" aria-label="DentalFlow — início" className="flex items-center gap-2.5 rounded-xl transition-opacity hover:opacity-80 shrink-0">
              <div className="h-9 w-9 shrink-0 rounded-full bg-[#4a9bff] grid place-items-center transition-all hover:scale-105 duration-500 shadow-[0_4px_12px_-4px_rgba(74,155,255,0.55)]">
                <span className="text-white text-[15px] font-semibold leading-none">D</span>
              </div>
              <div className="leading-tight">
                <div className="text-[15px] tracking-[0.02em] text-slate-800 dark:text-slate-100 uppercase">
                  <span className="font-light">DENTAL</span>
                  <span className="font-bold">FLOW</span>
                </div>
              </div>
            </Link>
          </div>
        </div>

        <div className="flex-1 max-w-2xl px-4">
          <GlobalSearch />
        </div>

        <div className="flex items-center gap-2">
          <NotificationPanel />
          
          <Link
            to="/"
            onClick={(event) => handleAnimatedNavigation(event, "/")}
            className="h-10 w-10 grid place-items-center rounded-xl text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-primary transition-all active:scale-95"
            title="Início"
          >
            <Home className="h-[21px] w-[21px] stroke-[1.4px]" />
          </Link>

          <button
            onClick={handleLogout}
            className="h-10 w-10 grid place-items-center rounded-xl text-slate-400 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 hover:text-rose-500 transition-all active:scale-95"
            title="Sair"
          >
            <LogOut className="h-[21px] w-[21px] stroke-[1.4px]" />
          </button>
        </div>
      </header>

      <aside
        className={`${pathname.startsWith("/dentes") ? "hidden" : "hidden md:flex"} flex-col bg-white dark:bg-black border-r border-slate-100 dark:border-white/5 transition-all duration-300 ease-out z-[60] fixed h-[calc(100vh-72px)] overflow-hidden top-[72px] ${
          isCollapsed ? "w-[72px]" : "w-64"
        }`}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {profile && (
            <div className={`p-6 transition-all duration-300 ${isCollapsed ? "pt-6 px-3.5" : "pt-10"}`}>
              <h2 className={`text-[17px] font-medium text-primary mb-6 transition-all duration-300 overflow-hidden whitespace-nowrap ${isCollapsed ? "opacity-0 h-0 mb-0" : "opacity-100 h-auto"}`}>
                Bem-vindo <span className="text-slate-500 dark:text-slate-400 font-light text-[15px]">de volta,</span>
              </h2>
              
              <Link
                to="/configuracoes"
                onClick={(event) => handleAnimatedNavigation(event, "/configuracoes")}
                className={`flex items-center bg-slate-50/50 dark:bg-slate-800/30 rounded-[32px] border border-slate-100/50 dark:border-slate-800/50 group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all active:scale-[0.98] ${
                  isCollapsed ? "p-1 gap-0 justify-center" : "p-3.5 gap-3"
                }`}
              >
                <div className={`shrink-0 rounded-full overflow-hidden bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 transition-all duration-300 ${
                  isCollapsed ? "h-10 w-10" : "h-12 w-12"
                }`}>
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.full_name ?? "Perfil"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full grid place-items-center text-primary text-sm font-semibold">
                      {profile.full_name?.[0]?.toUpperCase() ?? "U"}
                    </div>
                  )}
                </div>
                <div className={`min-w-0 transition-all duration-300 overflow-hidden ${isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100 ml-0"}`}>
                  <div className="text-[15px] font-medium text-slate-900 dark:text-slate-100 truncate tracking-tight">{profile.full_name?.split(' ')[0]}</div>
                  <div className="text-[11px] text-slate-400 font-light">Acessar perfil</div>
                </div>
              </Link>
            </div>
          )}

          <div className={`transition-all duration-300 ${isCollapsed ? "px-3.5 pb-2" : "px-6 pb-4"}`}>
            <div className="h-px bg-slate-100/80 dark:bg-white/5 w-full" />
          </div>

          <nav className={`flex flex-col gap-1.5 flex-1 overflow-y-auto overflow-x-hidden scrollbar-none py-2 transition-all duration-300 ${isCollapsed ? "px-3.5" : "px-3"}`}>
            {filteredNavItems.map((n) => {
              const active = n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
              const badgeCount =
                n.to === "/equipe" ? pendingCount :
                n.to === "/tarefas" ? tasksCount : 0;
              const showBadge = badgeCount > 0;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  preload="intent"
                  onClick={(event) => handleAnimatedNavigation(event, n.to)}
                  className={`group relative flex items-center rounded-xl text-sm transition-all duration-150 ${
                    active
                      ? "text-primary bg-primary/[0.02]"
                      : "text-slate-400 dark:text-slate-500 hover:text-primary"
                  } ${isCollapsed ? "px-0 justify-center py-3" : "px-4 py-3 gap-3"}`}
                >
                  <div className="relative flex items-center justify-center shrink-0 w-5">
                    <n.icon className={`h-5 w-5 stroke-[1.2px] transition-transform duration-150 ${active ? "text-primary scale-110" : "group-hover:text-primary group-hover:scale-110"}`} />
                    {showBadge && (
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />
                    )}
                  </div>
                  <span className={`font-light tracking-wide whitespace-nowrap transition-all duration-300 overflow-hidden ${
                    isCollapsed ? "w-0 opacity-0" : "flex-1 opacity-70 group-hover:opacity-100"
                  } ${active && !isCollapsed ? "opacity-100 font-normal" : ""}`}>
                    {n.label}
                  </span>
                  {showBadge && !isCollapsed && (
                    <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                      {badgeCount}
                    </span>
                  )}
                  {active && (
                    <div className="absolute left-0 w-1 h-5 bg-primary rounded-r-full" />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-slate-100 dark:border-white/5 bg-white dark:bg-black overflow-hidden flex flex-col">
            <div
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                e.currentTarget.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
                e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
              }}
              className="flex items-center justify-center w-full py-6 text-[13px] font-medium tracking-[0.1em] uppercase transition-all hover:bg-[#54A8FB]/[0.03] active:bg-[#54A8FB]/[0.05] group relative overflow-hidden text-slate-500"
            >
              <div className="absolute inset-x-0 bottom-0 h-px bg-slate-100 dark:bg-white/5" />
              <div 
                className="absolute w-24 h-24 bg-[#54A8FB] rounded-full blur-[30px] opacity-0 group-hover:opacity-20 pointer-events-none transition-opacity duration-300"
                style={{
                  left: 'var(--mouse-x, 50%)',
                  top: 'var(--mouse-y, 50%)',
                  transform: 'translate(-50%, -50%)',
                }}
              />
              <span className={`transition-all duration-300 whitespace-nowrap group-hover:text-primary ${isCollapsed ? "opacity-0 w-0 scale-75" : "opacity-100 w-auto scale-100"}`}>
                CLÍNICA
              </span>
              {isCollapsed && (
                <div className="absolute inset-0 grid place-items-center group-hover:text-primary transition-colors">
                  <Stethoscope className="h-5 w-5" />
                </div>
              )}
            </div>

            <div
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                e.currentTarget.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
                e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
              }}
              className="flex items-center justify-center w-full py-6 text-[13px] font-medium tracking-[0.1em] uppercase transition-all hover:bg-[#54A8FB]/[0.03] active:bg-[#54A8FB]/[0.05] group relative overflow-hidden text-slate-500"
            >
              <div className="absolute inset-x-0 top-0 h-px bg-slate-100 dark:bg-white/5" />
              <div className="absolute inset-x-0 bottom-0 h-px bg-slate-100 dark:bg-white/5" />
              <div 
                className="absolute w-24 h-24 bg-[#54A8FB] rounded-full blur-[30px] opacity-0 group-hover:opacity-20 pointer-events-none transition-opacity duration-300"
                style={{
                  left: 'var(--mouse-x, 50%)',
                  top: 'var(--mouse-y, 50%)',
                  transform: 'translate(-50%, -50%)',
                }}
              />
              <span className={`transition-all duration-300 whitespace-nowrap group-hover:text-primary ${isCollapsed ? "opacity-0 w-0 scale-75" : "opacity-100 w-auto scale-100"}`}>
                RADIOLOGIA
              </span>
              {isCollapsed && (
                <div className="absolute inset-0 grid place-items-center group-hover:text-primary transition-colors">
                  <LayoutDashboard className="h-5 w-5" />
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      <div className={`${pathname.startsWith("/dentes") ? "hidden" : "hidden md:block"} transition-all duration-300 shrink-0 ${isCollapsed ? "w-[72px]" : "w-64"}`} />

      {pathname.startsWith("/dentes") && (
        <>
          <div className="hidden md:flex fixed top-8 left-6 z-[60] items-center gap-3">
            <Link
              to="/"
              aria-label="DentalFlow — início"
              className="h-10 w-10 shrink-0 rounded-xl bg-primary/5 dark:bg-primary/10 grid place-items-center border border-primary/10 shadow-[0_0_15px_rgba(var(--primary),0.05)] transition-transform hover:scale-105 duration-500"
            >
              <Stethoscope className="h-5 w-5 text-primary stroke-[1.2px]" />
            </Link>


          </div>
        </>
      )}

      {/* ============ MOBILE APP HEADER (SVG-fiel) ============ */}
      <header
        className="md:hidden fixed top-0 inset-x-0 z-50 flex items-center gap-3 px-5 bg-white dark:bg-slate-950 pt-[env(safe-area-inset-top)]"
        style={{ height: "calc(4rem + env(safe-area-inset-top))" }}
      >
        {/* Marca: círculo azul com "D" + logotipo DENTALFLOW */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-9 w-9 rounded-full bg-[#4a9bff] grid place-items-center shrink-0 shadow-[0_4px_12px_-4px_rgba(74,155,255,0.55)]">
            <span className="text-white text-[15px] font-semibold leading-none">D</span>
          </div>
          <div className="text-[15px] tracking-[0.02em] text-slate-800 dark:text-slate-100 truncate">
            <span className="font-light">DENTAL</span>
            <span className="font-bold">FLOW</span>
          </div>
        </div>
        <div className="flex items-center gap-3 ml-auto shrink-0">
          {/* Sino próprio do mobile — dispara o mesmo trigger do painel global */}
          <button
            aria-label="Notificações"
            onClick={() => {
              const btn = document.getElementById("notification-trigger") as HTMLButtonElement | null;
              btn?.click();
            }}
            className="relative h-10 w-10 grid place-items-center text-slate-500 dark:text-slate-300 active:scale-90 transition-transform"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#4a9bff]" />
          </button>
          {/* Avatar do usuário (foto de perfil) */}
          <Link
            to="/configuracoes"
            aria-label="Configurações"
            className="h-11 w-11 rounded-full overflow-hidden bg-gradient-to-br from-[#2D7FF9] to-[#4a9bff] shadow-sm grid place-items-center text-white text-sm font-semibold"
          >
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile?.full_name ?? "Perfil"}
                className="h-full w-full object-cover"
              />
            ) : (
              <span>
                {(profile?.full_name ?? email ?? "?")
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((s) => s[0]?.toUpperCase())
                  .join("")}
              </span>
            )}
          </Link>
        </div>
      </header>

      <main data-scroll-container="app" className="relative h-screen flex-1 min-w-0 pt-[72px] md:pt-[72px] overflow-y-auto overflow-x-hidden bg-white dark:bg-slate-950">
        <PageTransition pathname={pathname} phase={pageTransitionPhase} transitionKey={pageTransitionKey}>
          <Outlet />
        </PageTransition>
      </main>

      {isAdmin && <BackupButton />}

      {/* ============ MOBILE BOTTOM TAB BAR — pill flutuante (fiel ao SVG) ============ */}
      <nav
        className="md:hidden fixed inset-x-0 z-50 pointer-events-none flex justify-center px-5"
        style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <div className="pointer-events-auto w-full max-w-md rounded-full bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl shadow-[0_18px_44px_-12px_rgba(15,23,42,0.22),0_6px_16px_-8px_rgba(15,23,42,0.12)] border border-white/60 dark:border-white/5 grid grid-cols-4 h-[68px] px-3">
          {(() => {
            const items = [
              { to: "/", label: "Início", icon: Home as any },
              ...filteredNavItems.filter((n) => n.to !== "/lab").slice(0, 2),
            ];
            return items.map((n) => {
              const active = n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
              const showBadge =
                (n.to === "/equipe" && pendingCount > 0) ||
                (n.to === "/tarefas" && tasksCount > 0);
              const Icon = n.icon as any;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  preload="intent"
                    onClick={(event) => handleAnimatedNavigation(event, n.to)}
                  className="relative flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-transform"
                >
                  <div className="relative grid place-items-center">
                    <Icon
                      className={`h-[26px] w-[26px] stroke-[1.7px] transition-colors ${
                        active ? "text-[#4a9bff]" : "text-slate-400 dark:text-slate-500"
                      }`}
                    />
                    {showBadge && (
                      <span className="absolute -top-0.5 -right-1 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />
                    )}
                  </div>
                  <span
                    className={`h-[3px] w-6 rounded-full transition-all ${
                      active ? "bg-[#4a9bff] opacity-100" : "bg-transparent opacity-0"
                    }`}
                  />
                </Link>
              );
            });
          })()}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <button className="relative flex flex-col items-center justify-center gap-1.5 text-slate-400 dark:text-slate-500 active:scale-95 transition-transform">
                <div className="relative grid place-items-center">
                  <MoreHorizontal className="h-[26px] w-[26px] stroke-[1.7px]" />
                  {(pendingCount + tasksCount) > 0 && filteredNavItems.slice(3).length > 0 && (
                    <span className="absolute -top-0.5 -right-1 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />
                  )}
                </div>
                <span className="h-[3px] w-6 rounded-full bg-transparent" />
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl border-0 p-0 max-h-[85vh] flex flex-col bg-white dark:bg-slate-900">
              <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-slate-200 dark:bg-slate-700" />
              <div className="px-6 pt-4 pb-2 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Menu</h2>
                  <p className="text-xs text-slate-400">Todas as ferramentas</p>
                </div>
                <button onClick={() => setMobileMenuOpen(false)} className="h-9 w-9 rounded-full bg-slate-100 dark:bg-slate-800 grid place-items-center text-slate-500 active:scale-90 transition-transform">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {profile && (
                <Link
                  to="/configuracoes"
                  onClick={(event) => handleAnimatedNavigation(event, "/configuracoes", { closeMobileMenu: true })}
                  className="mx-6 mt-2 rounded-2xl bg-primary/5 dark:bg-primary/10 border border-primary/10 p-3 flex items-center gap-3 active:scale-[0.99] transition"
                >
                  <div className="h-11 w-11 rounded-xl overflow-hidden bg-white dark:bg-slate-800 grid place-items-center text-sm font-semibold text-primary border border-primary/10">
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url} alt={profile.full_name ?? "Perfil"} className="h-full w-full object-cover" />
                    ) : (
                      <span>{profile.full_name?.[0]?.toUpperCase() ?? "U"}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{profile.full_name}</div>
                    <div className="text-[10px] text-primary/70 font-bold tracking-[0.15em] uppercase">{ROLE_LABELS[profile.role] ?? profile.role}</div>
                  </div>
                </Link>
              )}


              <div className="flex-1 overflow-y-auto px-4 py-4">
                <div className="grid grid-cols-4 gap-2">
                  {filteredNavItems.filter((n) => n.to !== "/lab").slice(2).map((n) => {
                    const active = pathname.startsWith(n.to);
                    const showBadge =
                      (n.to === "/equipe" && pendingCount > 0) ||
                      (n.to === "/tarefas" && tasksCount > 0);
                    return (
                      <Link
                        key={n.to}
                        to={n.to}
                        preload="intent"
                        onClick={(event) => handleAnimatedNavigation(event, n.to, { closeMobileMenu: true })}
                        className={`relative flex flex-col items-center justify-center gap-2 p-3 rounded-2xl transition-colors active:scale-95 ${
                          active ? "bg-primary/10 text-primary" : "bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        <div className="relative">
                          <n.icon className="h-6 w-6 stroke-[1.5px]" />
                          {showBadge && (
                            <span className="absolute -top-1 -right-1.5 h-2 w-2 rounded-full bg-rose-500" />
                          )}
                        </div>
                        <span className="text-[10px] font-medium text-center leading-tight">{n.label}</span>
                      </Link>
                    );
                  })}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2">
                  <button
                    onClick={() => { toggleTheme(); }}
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 active:scale-[0.98] transition-transform"
                  >
                    {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                    <span className="text-sm font-medium">{theme === "dark" ? "Tema claro" : "Tema escuro"}</span>
                  </button>
                  <button
                    onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 active:scale-[0.98] transition-transform"
                  >
                    <LogOut className="h-5 w-5" />
                    <span className="text-sm font-medium">Sair da conta</span>
                  </button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>



      <InstallPWAButton />
      <CaseDeepLink />
      <DialogAutoReopen />

    </div>
  );
}
