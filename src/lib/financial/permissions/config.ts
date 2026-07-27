/**
 * Sistema de permissões financeiras.
 *
 * Define perfis, módulos e o mapa (perfil × módulo × ação).
 * Preparado para multiempresa (Laboratório / Clínica / IPO completa).
 *
 * Observação: esta é a camada de CONFIGURAÇÃO. A aplicação real
 * (guards de rota, botões, RLS) consome este mapa via
 * `useFinancialPermissions` / `canAccessModule` / `canPerform`.
 */

// ---------------- Perfis ----------------
export type FinancialRole =
  | "CEO"
  | "ADMIN"
  | "FINANCEIRO"
  | "GESTOR"
  | "DENTISTA"
  | "CADISTA"
  | "PROTETICO"
  | "COLABORADOR";

export const FINANCIAL_ROLES: {
  id: FinancialRole;
  label: string;
  description: string;
}[] = [
  { id: "CEO", label: "CEO", description: "Acesso total, todas as empresas." },
  { id: "ADMIN", label: "Administrador", description: "Gestão administrativa completa." },
  { id: "FINANCEIRO", label: "Financeiro", description: "Operação financeira: caixa, pagamentos, relatórios." },
  { id: "GESTOR", label: "Gestor", description: "Visão gerencial, sem operações destrutivas." },
  { id: "DENTISTA", label: "Dentista", description: "Vê apenas seus próprios ganhos e casos." },
  { id: "CADISTA", label: "Cadista", description: "Foco em produção, sem acesso financeiro amplo." },
  { id: "PROTETICO", label: "Protético", description: "Foco em produção, vê apenas sua carteira." },
  { id: "COLABORADOR", label: "Colaborador", description: "Acesso restrito à operação básica." },
];

// ---------------- Módulos financeiros ----------------
export type FinancialModule =
  | "dashboard"
  | "fluxo-caixa"
  | "carteiras"
  | "producao"
  | "pagamentos"
  | "relatorios"
  | "configuracoes"
  | "meu-financeiro";

export type FinancialAction = "view" | "create" | "edit" | "delete" | "approve" | "export";

export const FINANCIAL_MODULES: {
  id: FinancialModule;
  label: string;
  path: string;
  description: string;
}[] = [
  { id: "dashboard", label: "Dashboard", path: "/financeiro", description: "Visão geral." },
  { id: "fluxo-caixa", label: "Fluxo de Caixa", path: "/financeiro/fluxo-caixa", description: "Entradas e saídas." },
  { id: "carteiras", label: "Carteiras", path: "/financeiro/carteiras", description: "Contas e bancos." },
  { id: "producao", label: "Produção", path: "/financeiro/producao", description: "Engine de produção financeira." },
  { id: "pagamentos", label: "Pagamentos", path: "/financeiro/pagamentos", description: "Fluxo de pagamentos." },
  { id: "relatorios", label: "Relatórios", path: "/financeiro/relatorios", description: "Relatórios e exportações." },
  { id: "configuracoes", label: "Configurações", path: "/financeiro/configuracoes", description: "Regras e parâmetros." },
  { id: "meu-financeiro", label: "Meu Financeiro", path: "/meu-financeiro", description: "Área pessoal do profissional." },
];

// ---------------- Tipos de empresa (multiempresa) ----------------
export type TenantKind = "laboratorio" | "clinica" | "ipo";
// Aliases externos usados na comunicação/UX (LAB / CLINIC / HYBRID).
export type TenantKindAlias = "LAB" | "CLINIC" | "HYBRID";
export const TENANT_KIND_ALIAS: Record<TenantKind, TenantKindAlias> = {
  laboratorio: "LAB",
  clinica: "CLINIC",
  ipo: "HYBRID",
};
export const TENANT_KIND_FROM_ALIAS: Record<TenantKindAlias, TenantKind> = {
  LAB: "laboratorio",
  CLINIC: "clinica",
  HYBRID: "ipo",
};

export const TENANT_KINDS: { id: TenantKind; label: string; description: string }[] = [
  { id: "laboratorio", label: "Laboratório", description: "Foco em produção e pagamentos a proteticos/cadistas." },
  { id: "clinica", label: "Clínica", description: "Foco em atendimento, dentistas e recebíveis." },
  { id: "ipo", label: "IPO completa", description: "Operação integrada: laboratório + clínica." },
];

// ---------------- Escopo de visibilidade financeira ----------------
// 'all' = vê dados de todos os profissionais da empresa
// 'own' = vê apenas os próprios ganhos e histórico
export type FinancialScope = "all" | "own" | "none";

const SCOPE_BY_ROLE: Record<FinancialRole, FinancialScope> = {
  CEO: "all",
  ADMIN: "all",
  FINANCEIRO: "all",
  GESTOR: "all",
  DENTISTA: "own",
  CADISTA: "own",
  PROTETICO: "own",
  COLABORADOR: "own",
};

export function financialScope(role: FinancialRole | null | undefined): FinancialScope {
  if (!role) return "none";
  return SCOPE_BY_ROLE[role] ?? "none";
}

/** True se o role só pode ver o próprio financeiro. Espelha a policy `earnings_select_scoped` no banco. */
export function isOwnScopeOnly(role: FinancialRole | null | undefined): boolean {
  return financialScope(role) === "own";
}

// ---------------- Matriz de permissões ----------------
type PermissionMap = Record<FinancialRole, Partial<Record<FinancialModule, FinancialAction[]>>>;

const ALL: FinancialAction[] = ["view", "create", "edit", "delete", "approve", "export"];
const VIEW_ONLY: FinancialAction[] = ["view"];
const VIEW_EXPORT: FinancialAction[] = ["view", "export"];
const OPERATE: FinancialAction[] = ["view", "create", "edit", "export"];

export const PERMISSIONS: PermissionMap = {
  CEO: {
    dashboard: ALL,
    "fluxo-caixa": ALL,
    carteiras: ALL,
    producao: ALL,
    pagamentos: ALL,
    relatorios: ALL,
    configuracoes: ALL,
    "meu-financeiro": VIEW_ONLY,
  },
  ADMIN: {
    dashboard: ALL,
    "fluxo-caixa": ALL,
    carteiras: ALL,
    producao: ALL,
    pagamentos: ALL,
    relatorios: ALL,
    configuracoes: ALL,
    "meu-financeiro": VIEW_ONLY,
  },
  FINANCEIRO: {
    dashboard: VIEW_EXPORT,
    "fluxo-caixa": OPERATE,
    carteiras: OPERATE,
    producao: VIEW_EXPORT,
    pagamentos: [...OPERATE, "approve"],
    relatorios: VIEW_EXPORT,
    configuracoes: VIEW_ONLY,
    "meu-financeiro": VIEW_ONLY,
  },
  GESTOR: {
    dashboard: VIEW_EXPORT,
    "fluxo-caixa": VIEW_EXPORT,
    carteiras: VIEW_ONLY,
    producao: VIEW_EXPORT,
    pagamentos: VIEW_EXPORT,
    relatorios: VIEW_EXPORT,
    "meu-financeiro": VIEW_ONLY,
  },
  DENTISTA: {
    producao: VIEW_ONLY,
    "meu-financeiro": VIEW_ONLY,
  },
  CADISTA: {
    producao: VIEW_ONLY,
    "meu-financeiro": VIEW_ONLY,
  },
  PROTETICO: {
    producao: VIEW_ONLY,
    "meu-financeiro": VIEW_ONLY,
  },
  COLABORADOR: {
    "meu-financeiro": VIEW_ONLY,
  },
};

// ---------------- Restrições por tipo de empresa ----------------
// Módulos disponíveis por tipo (para futura ativação/ocultação).
export const TENANT_MODULES: Record<TenantKind, FinancialModule[]> = {
  laboratorio: [
    "dashboard",
    "fluxo-caixa",
    "carteiras",
    "producao",
    "pagamentos",
    "relatorios",
    "configuracoes",
    "meu-financeiro",
  ],
  clinica: [
    "dashboard",
    "fluxo-caixa",
    "carteiras",
    "pagamentos",
    "relatorios",
    "configuracoes",
    "meu-financeiro",
  ],
  ipo: [
    "dashboard",
    "fluxo-caixa",
    "carteiras",
    "producao",
    "pagamentos",
    "relatorios",
    "configuracoes",
    "meu-financeiro",
  ],
};

// ---------------- Helpers ----------------
export function canAccessModule(
  role: FinancialRole | null | undefined,
  module: FinancialModule,
  tenantKind: TenantKind = "ipo",
): boolean {
  if (!role) return false;
  if (!TENANT_MODULES[tenantKind].includes(module)) return false;
  const actions = PERMISSIONS[role]?.[module];
  return Boolean(actions && actions.includes("view"));
}

export function canPerform(
  role: FinancialRole | null | undefined,
  module: FinancialModule,
  action: FinancialAction,
  tenantKind: TenantKind = "ipo",
): boolean {
  if (!role) return false;
  if (!TENANT_MODULES[tenantKind].includes(module)) return false;
  const actions = PERMISSIONS[role]?.[module];
  return Boolean(actions && actions.includes(action));
}

export function modulesForRole(
  role: FinancialRole | null | undefined,
  tenantKind: TenantKind = "ipo",
): FinancialModule[] {
  if (!role) return [];
  return FINANCIAL_MODULES.filter((m) => canAccessModule(role, m.id, tenantKind)).map((m) => m.id);
}
