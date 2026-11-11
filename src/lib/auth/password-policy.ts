export const NEW_PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MINIMUM_MESSAGE = `A senha deve ter pelo menos ${NEW_PASSWORD_MIN_LENGTH} caracteres.`;

// Do not trim or otherwise rewrite credentials. Count characters rather than
// UTF-16 units, so four emoji cannot satisfy an eight-character policy.
export function newPasswordError(password: unknown): string | null {
  return typeof password === "string" && Array.from(password).length >= NEW_PASSWORD_MIN_LENGTH
    ? null
    : PASSWORD_MINIMUM_MESSAGE;
}
