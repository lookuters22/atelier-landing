import { extractFirstEmailFromAddressString } from "./mailboxNormalize";

export function parseSenderLine(sender: string): { email: string | null; displayName: string } {
  const t = sender.trim();
  if (!t) return { email: null, displayName: "Unknown" };
  const email = extractFirstEmailFromAddressString(t);
  if (!email) return { email: null, displayName: t };
  const angle = /<([^>]+@[^>]+)>/i.exec(t);
  if (angle && angle.index !== undefined && angle.index > 0) {
    const name = t
      .slice(0, angle.index)
      .replace(/^["']|["']$/g, "")
      .trim();
    return {
      email,
      displayName: name || email.split("@")[0] || "Contact",
    };
  }
  return {
    email,
    displayName: email.split("@")[0] || "Contact",
  };
}
