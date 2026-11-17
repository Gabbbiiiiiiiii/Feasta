export function signInValidationError(email: string, password: string): string | null {
  const address = email.trim();
  if (!address) return "Email address is required.";
  if (address.length > 254) return "Email address is too long.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return "Please enter a valid email address.";
  if (!password) return "Password is required.";
  if (password.length > 128) return "Password is too long.";
  return null;
}
