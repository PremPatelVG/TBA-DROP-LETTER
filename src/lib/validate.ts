/** Indian phone number: 10 digits, optionally starting with +91. Spaces and dashes are allowed anywhere. */
export function isIndianPhone(value: string) {
  return /^(\+91)?\d{10}$/.test(value.replace(/[\s-]/g, ""));
}

/** Basic email shape: name@domain.tld, no spaces. */
export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
