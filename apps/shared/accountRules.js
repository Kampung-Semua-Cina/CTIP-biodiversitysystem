// apps/shared/accountRules.js
// Why an email address, temporary password or name cannot be used, in plain
// words, so a form can say what to fix instead of "invalid". Each function
// returns the reason, or null when the value is fine.
//
// The API checks the same rules (services/api/src/accountRules.js, a copy,
// because the API is deployed without apps/). Change both together.
// No imports, so both apps can use it as it is.

// The part before the @ may use these (RFC 5322 "atext", plus dots between them).
const LOCAL_CHARS = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/;
const DOMAIN = /^(?=.{1,253}$)([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
const GMAIL = new Set(["gmail.com", "googlemail.com"]);
// Common slips in the most used domains.
const TYPOS = {
  "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gamil.com": "gmail.com", "gmail.co": "gmail.com",
  "gmail.con": "gmail.com", "gmail.cm": "gmail.com", "gnail.com": "gmail.com", "gmaill.com": "gmail.com",
  "hotmial.com": "hotmail.com", "hotmail.co": "hotmail.com", "yahoo.co": "yahoo.com", "yaho.com": "yahoo.com",
  "outlook.co": "outlook.com", "outlok.com": "outlook.com",
};

export function emailProblem(value) {
  const email = String(value ?? "").trim();
  if (!email) return "Enter an email address.";
  if (/\s/.test(email)) return "An email address cannot contain spaces.";
  const at = email.split("@").length - 1;
  if (at !== 1) return "An email address needs exactly one @, like name@gmail.com.";
  if (email.length > 254) return "This email address is too long (254 characters at most).";
  const [local, domain] = email.split("@");
  if (!local) return "Add the name before the @, like name@gmail.com.";
  if (!domain) return "Add the domain after the @, like name@gmail.com.";
  if (local.length > 64) return "The part before the @ is too long (64 characters at most).";
  if (!LOCAL_CHARS.test(local)) return "The part before the @ has a character an email address cannot use.";
  if (local.startsWith(".") || local.endsWith(".")) return "The part before the @ cannot start or end with a dot.";
  if (local.includes("..")) return "The part before the @ cannot have two dots in a row.";
  const host = domain.toLowerCase();
  if (TYPOS[host]) return `"${domain}" looks like a typo. Did you mean ${TYPOS[host]}?`;
  if (!host.includes(".")) return `"${domain}" is not a full domain. It should look like gmail.com.`;
  if (!DOMAIN.test(host)) return `"${domain}" is not a valid domain. It should look like gmail.com.`;

  // Gmail's own rules: 6 to 30 letters, numbers and dots (dots and anything
  // after a + do not count), so 1@gmail.com cannot exist.
  if (GMAIL.has(host)) {
    const name = local.split("+")[0];
    if (!/^[A-Za-z0-9.]+$/.test(name)) return "Gmail addresses can only use letters, numbers and dots before the @.";
    const length = name.replace(/\./g, "").length;
    if (length < 6 || length > 30) {
      return `Gmail addresses have 6 to 30 letters or numbers before the @; "${name}" has ${length}. Check the address.`;
    }
  }
  return null;
}

export const PASSWORD_MIN = 8;
export function passwordProblem(value) {
  const pw = String(value ?? "");
  if (pw.length < PASSWORD_MIN) return `The temporary password needs at least ${PASSWORD_MIN} characters (it has ${pw.length}).`;
  if (pw.length > 200) return "The temporary password is too long (200 characters at most).";
  if (/^\s|\s$/.test(pw)) return "The temporary password cannot start or end with a space.";
  return null;
}

export function nameProblem(value) {
  const name = String(value ?? "").trim();
  if (!name) return "Enter the person's name.";
  if (name.length > 200) return "The name is too long (200 characters at most).";
  return null;
}

// Supabase's reasons for refusing a password (weak_password), in plain words.
const WEAK_REASONS = {
  length: "it is too short for the project's password rules",
  characters: "it needs a mix of character types (for example lower and upper case letters, numbers and symbols)",
  pwned: "it has appeared in a known data leak, so it is easy to guess",
};
export const weakPasswordMessage = (reasons = []) => {
  const words = reasons.map((r) => WEAK_REASONS[r]).filter(Boolean);
  return `Supabase refused this password${words.length ? `: ${words.join("; ")}` : ""}. Choose a stronger one.`;
};
