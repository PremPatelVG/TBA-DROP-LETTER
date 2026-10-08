/** Indian phone number: 10 digits, optionally starting with +91. Spaces and dashes are allowed anywhere. */
export function isIndianPhone(value: string) {
  return /^(\+91)?\d{10}$/.test(value.replace(/[\s-]/g, ""));
}

/** Basic email shape: name@domain.tld, no spaces. */
export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Shortest password we accept when an account is created or its password is reset. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Checks a password being SET (at account creation or on an admin/self reset), not one being typed to sign in.
 * At least {@link MIN_PASSWORD_LENGTH} characters, and not absurdly long. Returns a message, or null when fine.
 */
export function passwordError(password: string): string | null {
  if (!password) return "Enter a password.";
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > 128) return "Password is too long (at most 128 characters).";
  return null;
}

export type ContactField = "phone" | "email";

/**
 * Checks the responder's contact details for a response. When the letter is marked as responded,
 * at least one of phone and email is needed, and whatever is filled in must be well formed.
 * Returns null when everything is fine.
 */
export function responseContactError(responded: boolean, phone: string, email: string): { field: ContactField; message: string } | null {
  if (!responded) return null;
  const p = phone.trim();
  const e = email.trim();
  if (!p && !e) return { field: "phone", message: "Add the phone number or the email of the person who responded. At least one is needed." };
  if (p && !isIndianPhone(p)) return { field: "phone", message: "Phone number: use 10 digits, optionally starting with +91, for example +91 98765 43210." };
  if (e && !isEmail(e)) return { field: "email", message: "Email: use a full address, for example name@company.com." };
  return null;
}
