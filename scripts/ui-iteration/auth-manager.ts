import type { Page } from "playwright-core";

export interface AuthConfig {
  baseUrl: string;
  email: string;
  password: string;
}

function getAuthProfiles(): Record<string, AuthConfig> {
  return {
    demo: {
      baseUrl: process.env.UI_PATROL_BASE_URL || "http://localhost:3000",
      email: process.env.UI_PATROL_DEMO_EMAIL || "demo@deepdive.ai",
      password: process.env.UI_PATROL_DEMO_PASSWORD || "demo123456",
    },
    admin: {
      baseUrl: process.env.UI_PATROL_BASE_URL || "http://localhost:3000",
      email: process.env.UI_PATROL_ADMIN_EMAIL || "admin@deepdive.ai",
      password: process.env.UI_PATROL_ADMIN_PASSWORD || "admin123456",
    },
  };
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

let cachedTokens: Record<string, AuthTokens> = {};

export async function getAuthTokens(
  profile: string = "demo",
  baseUrl?: string,
): Promise<AuthTokens> {
  if (cachedTokens[profile]) {
    return cachedTokens[profile];
  }

  const profiles = getAuthProfiles();
  const config = profiles[profile];
  if (!config) {
    throw new Error(
      `Unknown auth profile: ${profile}. Available: ${Object.keys(profiles).join(", ")}`,
    );
  }

  const url = baseUrl || config.baseUrl;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${url}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: config.email, password: config.password }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Auth failed for ${profile}: ${response.status} ${text}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    if (
      typeof data.accessToken !== "string" ||
      typeof data.refreshToken !== "string"
    ) {
      throw new Error(`Auth response missing tokens for ${profile}`);
    }

    const tokens: AuthTokens = {
      accessToken: data.accessToken as string,
      refreshToken: data.refreshToken as string,
    };

    cachedTokens[profile] = tokens;
    return tokens;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function injectAuth(
  page: Page,
  profile: string = "demo",
  baseUrl?: string,
): Promise<void> {
  const tokens = await getAuthTokens(profile, baseUrl);

  // Inject tokens into localStorage before any navigation
  await page.addInitScript((tokensArg: AuthTokens) => {
    localStorage.setItem("access_token", tokensArg.accessToken);
    localStorage.setItem("refresh_token", tokensArg.refreshToken);
  }, tokens);
}

export function clearCachedTokens(): void {
  cachedTokens = {};
}
