import { createAccountsHubClient, env, Services, setCliTokenOverride } from '@powersync/cli-core';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

describe('cli token override', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();

    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ id: 'org', label: 'test' }), {
        headers: { 'content-type': 'application/json' },
        status: 200
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    env.PS_ADMIN_TOKEN = undefined;
    setCliTokenOverride(null);
  });

  test('override takes precedence over PS_ADMIN_TOKEN and stored token', async () => {
    env.PS_ADMIN_TOKEN = 'env-token';
    vi.spyOn(Services.authentication, 'getToken').mockResolvedValue('stored-token');
    setCliTokenOverride('override-token');

    const accounts = createAccountsHubClient();
    await accounts.getOrganization({ id: 'org' });

    const headers = new Headers(
      (fetchSpy.mock.calls[0] as [unknown, { headers?: Record<string, string> }])[1]?.headers
    );
    expect(headers.get('authorization')).toEqual('Bearer override-token');
  });

  test('falls back to PS_ADMIN_TOKEN when override is null', async () => {
    env.PS_ADMIN_TOKEN = 'env-token';
    vi.spyOn(Services.authentication, 'getToken').mockResolvedValue('stored-token');
    setCliTokenOverride(null);

    const accounts = createAccountsHubClient();
    await accounts.getOrganization({ id: 'org' });

    const headers = new Headers(
      (fetchSpy.mock.calls[0] as [unknown, { headers?: Record<string, string> }])[1]?.headers
    );
    expect(headers.get('authorization')).toEqual('Bearer env-token');
  });

  test('falls back to stored token when override and env are absent', async () => {
    env.PS_ADMIN_TOKEN = undefined;
    vi.spyOn(Services.authentication, 'getToken').mockResolvedValue('stored-token');
    setCliTokenOverride(null);

    const accounts = createAccountsHubClient();
    await accounts.getOrganization({ id: 'org' });

    const headers = new Headers(
      (fetchSpy.mock.calls[0] as [unknown, { headers?: Record<string, string> }])[1]?.headers
    );
    expect(headers.get('authorization')).toEqual('Bearer stored-token');
  });

  test('empty/whitespace override is treated as absent', async () => {
    env.PS_ADMIN_TOKEN = 'env-token';
    vi.spyOn(Services.authentication, 'getToken').mockResolvedValue('stored-token');
    setCliTokenOverride('   ');

    const accounts = createAccountsHubClient();
    await accounts.getOrganization({ id: 'org' });

    const headers = new Headers(
      (fetchSpy.mock.calls[0] as [unknown, { headers?: Record<string, string> }])[1]?.headers
    );
    expect(headers.get('authorization')).toEqual('Bearer env-token');
  });

  test('throws with PAT creation URL when no token is available', async () => {
    env.PS_ADMIN_TOKEN = undefined;
    vi.spyOn(Services.authentication, 'getToken').mockResolvedValue(null);
    setCliTokenOverride(null);

    const accounts = createAccountsHubClient();
    await expect(accounts.getOrganization({ id: 'org' })).rejects.toThrow(/dashboard\.powersync\.com/);
  });
});
