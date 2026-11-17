/**
 * Friendly Cloud Login messages for native mobile without leaking server internals.
 */
export function readableLoginError(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : typeof error === "object" && error !== null && "message" in error
        ? String(error.message ?? "")
        : "";

  if (/invalid login credentials|invalid email or password|invalid_grant/i.test(message)) {
    return "E-mail ou senha incorretos. Confira seus dados e tente novamente.";
  }
  if (/email not confirmed|email_not_confirmed/i.test(message)) {
    return "Confirme seu e-mail antes de entrar no DentalFlow.";
  }
  if (/rate limit|too many requests|429|over_request_rate_limit/i.test(message)) {
    return "Muitas tentativas de acesso. Aguarde um pouco e tente novamente.";
  }
  if (/missing supabase environment|supabase_url|supabase_publishable_key/i.test(message)) {
    return "A conexão do aplicativo ainda não está configurada. Contate o suporte DentalFlow.";
  }
  if (/failed to fetch|networkerror|network error|load failed|fetch failed|timeout|tempo limite|cloud login|dns/i.test(message)) {
    return "Não foi possível conectar ao DentalFlow. Verifique a internet ou tente novamente mais tarde.";
  }
  return "Não foi possível entrar. Verifique seus dados e tente novamente.";
}
