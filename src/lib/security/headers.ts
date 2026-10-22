/**
 * Central definition of the app's security headers, so the SSR server
 * (src/start.ts) and the HTML shell (src/routes/__root.tsx) can't drift.
 *
 * The Content-Security-Policy is the single most important control for the
 * web demo of the vault: even if a script is somehow injected (XSS, a compromised
 * dependency, an MITM without cert pinning), a strict `connect-src` prevents
 * it from exfiltrating the seed phrase or password to an attacker-controlled
 * server, and `object-src` / `base-uri` / `form-action` close common
 * escalation vectors.
 *
 * NOTE on `script-src`: this SSR React app relies on framework-generated
 * inline hydration scripts plus two small inline bootstrap scripts in
 * __root.tsx. Locking `script-src` to hashes/nonces requires threading a
 * per-request nonce through TanStack Start and is tracked as a follow-up
 * (see SECURITY-AUDIT.md). Until then we keep `'unsafe-inline'` on
 * `script-src` ONLY. That does not weaken the exfiltration protection, which
 * comes from `connect-src`.
 *
 * HME Vault has no network code: connect-src is 'self' only, so even an injected
 * script cannot send secrets anywhere. Do not add remote origins here.
 */

// The vault has no network code at all (project rule): nothing may connect out.
const CONNECT_SRC = "'self'";

const CSP_DIRECTIVES: Record<string, string> = {
  "default-src": "'self'",
  // See note above: unsafe-inline stays until nonce plumbing lands.
  "script-src": "'self' 'unsafe-inline'",
  // Tailwind + Radix/vaul inject inline styles.
  "style-src": "'self' 'unsafe-inline'",
  // Local brand images and QR data URLs only. No remote images: an injected
  // script must not be able to carry secrets out through an image request.
  "img-src": "'self' data:",
  "font-src": "'self' data:",
  "connect-src": CONNECT_SRC,
  "manifest-src": "'self'",
  "worker-src": "'self' blob:",
  "object-src": "'none'",
  "base-uri": "'none'",
  "form-action": "'self'",
  "frame-src": "'none'",
  "frame-ancestors": "'none'",
  "upgrade-insecure-requests": "",
};

/** Full CSP string suitable for a response header. */
export const CONTENT_SECURITY_POLICY = Object.entries(CSP_DIRECTIVES)
  .map(([k, v]) => (v ? `${k} ${v}` : k))
  .join("; ");

/**
 * CSP for a <meta http-equiv> tag. `frame-ancestors` is ignored inside a
 * meta tag by spec, so we drop it here (it is still sent as a real header by
 * the server) to avoid a console warning.
 */
export const CONTENT_SECURITY_POLICY_META = Object.entries(CSP_DIRECTIVES)
  .filter(([k]) => k !== "frame-ancestors")
  .map(([k, v]) => (v ? `${k} ${v}` : k))
  .join("; ");

/** Non-CSP security headers applied to every server response. */
export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};
