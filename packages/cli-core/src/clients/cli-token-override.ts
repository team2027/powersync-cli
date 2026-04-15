/**
 * Process-wide store for an explicit auth token passed via `--token` flag.
 *
 * Resolution precedence for auth:
 *   1. Token override set here via `setCliTokenOverride` (from `--token` flag)
 *   2. `PS_ADMIN_TOKEN` environment variable
 *   3. Stored token (keychain or insecure config) via `Services.authentication`
 *
 * Uses the same `globalThis` + `Symbol.for(...)` pattern as `cli-client-headers` so
 * that all copies of `@powersync/cli-core` in the process see the same override.
 */
const CLI_TOKEN_OVERRIDE_STORE_KEY = Symbol.for('powersync.cli-core.cliTokenOverride');

type CliTokenOverrideStore = {
  token: null | string;
};

function getStore(): CliTokenOverrideStore {
  const globalScope = globalThis as typeof globalThis & {
    [CLI_TOKEN_OVERRIDE_STORE_KEY]?: CliTokenOverrideStore;
  };

  if (!globalScope[CLI_TOKEN_OVERRIDE_STORE_KEY]) {
    globalScope[CLI_TOKEN_OVERRIDE_STORE_KEY] = { token: null };
  }

  return globalScope[CLI_TOKEN_OVERRIDE_STORE_KEY];
}

/**
 * Sets an explicit auth token that takes precedence over the env var and stored token.
 * Pass null/undefined/empty string to clear the override.
 */
export function setCliTokenOverride(token: null | string | undefined): void {
  const trimmed = typeof token === 'string' ? token.trim() : '';
  getStore().token = trimmed.length > 0 ? trimmed : null;
}

export function getCliTokenOverride(): null | string {
  return getStore().token;
}
