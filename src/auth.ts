/**
 * Optional Auth0 login for the web viewer (Auth0 for AI Agents partner
 * integration).
 *
 * When AUTH0_DOMAIN, AUTH0_CLIENT_ID and AUTH0_CLIENT_SECRET are all
 * set, `npm run serve` requires an Auth0 login before showing the
 * digest: a standard OAuth 2.0 / OIDC authorization-code flow with PKCE,
 * implemented with the `openid-client` library. Routes added:
 *   /login     → redirects to Auth0
 *   /callback  → Auth0 redirects back here (register it in the app's
 *                Allowed Callback URLs)
 *   /logout    → clears the session and logs out of Auth0 (register the
 *                viewer origin in Allowed Logout URLs)
 *
 * Sessions are a random cookie id mapped to the ID-token claims, held in
 * memory — right-sized for a personal digest viewer. Without the three
 * env vars the viewer stays wide open, exactly as before.
 *
 * AUTH0_BASE_URL sets the public origin used for redirects
 * (default http://localhost:<PORT>).
 */
import { randomBytes } from "node:crypto";
import type http from "node:http";
import * as oidc from "openid-client";

const DOMAIN = process.env.AUTH0_DOMAIN;
const CLIENT_ID = process.env.AUTH0_CLIENT_ID;
const CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET;

export function authEnabled(): boolean {
  return Boolean(DOMAIN && CLIENT_ID && CLIENT_SECRET);
}

function baseUrl(): string {
  return process.env.AUTH0_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4173}`;
}

interface SessionUser {
  sub: string;
  email?: string;
  name?: string;
}
const sessions = new Map<string, SessionUser>();
const pendingLogins = new Map<string, { verifier: string; nonce: string }>();

let configPromise: Promise<oidc.Configuration> | null = null;
function getConfig(): Promise<oidc.Configuration> {
  if (!configPromise) {
    configPromise = oidc.discovery(
      new URL(`https://${DOMAIN}/`),
      CLIENT_ID as string,
      CLIENT_SECRET as string,
    );
  }
  return configPromise;
}

function parseCookies(req: http.IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const idx = part.indexOf("=");
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function currentUser(req: http.IncomingMessage): SessionUser | null {
  const sid = parseCookies(req)["sloth_session"];
  return sid ? sessions.get(sid) ?? null : null;
}

/**
 * Returns true when the request may proceed to the digest. When Auth0 is
 * enabled and the request is unauthenticated (or is a login/callback/
 * logout route), this responds itself and returns false.
 */
export async function authGate(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<boolean> {
  if (!authEnabled()) return true;
  const url = new URL(req.url ?? "/", baseUrl());

  if (url.pathname === "/login") {
    try {
      const config = await getConfig();
      const verifier = oidc.randomPKCECodeVerifier();
      const challenge = await oidc.calculatePKCECodeChallenge(verifier);
      const state = oidc.randomState();
      const nonce = oidc.randomNonce();
      pendingLogins.set(state, { verifier, nonce });
      const authUrl = oidc.buildAuthorizationUrl(config, {
        redirect_uri: `${baseUrl()}/callback`,
        scope: "openid profile email",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state,
        nonce,
      });
      res.writeHead(302, { location: authUrl.href });
      res.end();
    } catch (err) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end(`Auth0 login failed to start: ${err instanceof Error ? err.message : String(err)}`);
    }
    return false;
  }

  if (url.pathname === "/callback") {
    try {
      const state = url.searchParams.get("state") ?? "";
      const pending = pendingLogins.get(state);
      if (!pending) throw new Error("unknown or expired login state");
      pendingLogins.delete(state);
      const config = await getConfig();
      const tokens = await oidc.authorizationCodeGrant(config, url, {
        pkceCodeVerifier: pending.verifier,
        expectedState: state,
        expectedNonce: pending.nonce,
        idTokenExpected: true,
      });
      const claims = tokens.claims();
      if (!claims) throw new Error("no ID token returned");
      const sid = randomBytes(24).toString("hex");
      sessions.set(sid, {
        sub: claims.sub,
        email: typeof claims.email === "string" ? claims.email : undefined,
        name: typeof claims.name === "string" ? claims.name : undefined,
      });
      res.writeHead(302, {
        location: "/",
        "set-cookie": `sloth_session=${sid}; HttpOnly; Path=/; SameSite=Lax`,
      });
      res.end();
    } catch (err) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end(`Auth0 callback failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return false;
  }

  if (url.pathname === "/logout") {
    const sid = parseCookies(req)["sloth_session"];
    if (sid) sessions.delete(sid);
    const logoutUrl =
      `https://${DOMAIN}/v2/logout?client_id=${encodeURIComponent(CLIENT_ID as string)}` +
      `&returnTo=${encodeURIComponent(baseUrl())}`;
    res.writeHead(302, {
      location: logoutUrl,
      "set-cookie": "sloth_session=; HttpOnly; Path=/; Max-Age=0",
    });
    res.end();
    return false;
  }

  if (currentUser(req)) return true;

  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(
    `<!doctype html><meta charset="utf-8"><title>Digest Sloth — locked</title>` +
      `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;text-align:center">` +
      `<h1>🦥 This digest is private</h1><p><a href="/login">Log in with Auth0</a> to read it.</p></body>`,
  );
  return false;
}
