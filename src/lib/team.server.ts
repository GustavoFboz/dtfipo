type AppRole = "CEO" | "DR" | "PROTETICO" | "ATENDIMENTO" | "CADISTA" | "USER";

const ENUM_ROLE_BY_APP_ROLE: Record<AppRole, string> = {
  CEO: "admin",
  DR: "dentista",
  PROTETICO: "protetico",
  CADISTA: "cadista",
  ATENDIMENTO: "recepcionista",
  USER: "auxiliar",
};

export function toDbAppRole(role: AppRole): string {
  return ENUM_ROLE_BY_APP_ROLE[role] ?? "auxiliar";
}

export function isTeamAdmin(role: string | null | undefined): boolean {
  return role === "CEO" || role === "DR";
}

export function sanitizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type { AppRole };