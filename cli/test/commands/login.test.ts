import { confirm, password } from '@inquirer/prompts';
import { Config } from '@oclif/core';
import { captureOutput } from '@oclif/test';
import * as cliCore from '@powersync/cli-core';
import { Services, StorageImpl } from '@powersync/cli-core';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { startPATLoginServer } from '../../src/api/login-server.js';
import LoginCommand from '../../src/commands/login.js';
import { root } from '../helpers/root.js';

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
  password: vi.fn()
}));

vi.mock('../../src/api/login-server.js', () => ({
  startPATLoginServer: vi.fn()
}));

const mockedConfirm = vi.mocked(confirm);
const mockedPassword = vi.mocked(password);
const mockedStartPATLoginServer = vi.mocked(startPATLoginServer);
const mockedCreateAccountsHubClient = vi.spyOn(cliCore, 'createAccountsHubClient');

describe('login', () => {
  let oclifConfig: Config;
  const authentication = {
    deleteToken: vi.fn(),
    getToken: vi.fn(),
    setToken: vi.fn()
  };

  beforeAll(async () => {
    oclifConfig = await Config.load({ root });
  });

  beforeEach(() => {
    mockedConfirm.mockReset();
    mockedPassword.mockReset();
    mockedStartPATLoginServer.mockReset();
    mockedCreateAccountsHubClient.mockReset();
    authentication.getToken.mockReset();
    authentication.setToken.mockReset();
    authentication.deleteToken.mockReset();

    authentication.getToken.mockResolvedValue(null);
    authentication.setToken.mockResolvedValue(null);
    authentication.deleteToken.mockResolvedValue(null);

    Services.storage = {
      capabilities: { supportsSecureStorage: true },
      insecureStoragePath: '/tmp/powersync-config.json'
    } as unknown as StorageImpl;
    Services.authentication = authentication as unknown as cliCore.AuthenticationServiceImpl;

    mockedConfirm.mockResolvedValue(false);
    mockedPassword.mockResolvedValue('  test-token  ');
    mockedStartPATLoginServer.mockResolvedValue({
      address: 'http://127.0.0.1:54321',
      tokenPromise: Promise.resolve('server-token')
    });
    mockedCreateAccountsHubClient.mockReturnValue({
      listOrganizations: vi.fn().mockResolvedValue({
        objects: [{ id: 'org-1', label: 'Org One' }]
      })
    } as unknown as cliCore.AccountsHubClientSDKClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function runLoginDirect() {
    const cmd = new LoginCommand([], oclifConfig);
    return captureOutput(() => cmd.run());
  }

  function runLoginWithArgs(argv: string[]) {
    const cmd = new LoginCommand(argv, oclifConfig);
    return captureOutput(() => cmd.run());
  }

  it('stores token non-interactively when --token is provided', async () => {
    const result = await runLoginWithArgs(['--token', '  jpt_abc123  ']);

    expect(result.error).toBeUndefined();
    expect(authentication.setToken).toHaveBeenCalledWith('jpt_abc123');
    expect(mockedConfirm).not.toHaveBeenCalled();
    expect(mockedPassword).not.toHaveBeenCalled();
    expect(mockedStartPATLoginServer).not.toHaveBeenCalled();
    expect(result.stdout).toContain('Token stored.');
  });

  it('overwrites existing token silently when --token is provided', async () => {
    authentication.getToken.mockResolvedValueOnce('existing-token');
    const result = await runLoginWithArgs(['--token', 'new-token']);

    expect(result.error).toBeUndefined();
    expect(authentication.deleteToken).toHaveBeenCalledTimes(1);
    expect(authentication.setToken).toHaveBeenCalledWith('new-token');
    expect(mockedConfirm).not.toHaveBeenCalled();
  });

  it('errors when --token is provided but secure storage is unavailable and --force-insecure is not set', async () => {
    Services.storage = {
      capabilities: { supportsSecureStorage: false },
      insecureStoragePath: '/tmp/powersync-config.json'
    } as unknown as StorageImpl;

    const result = await runLoginWithArgs(['--token', 'abc']);

    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain('Secure storage is unavailable');
    expect(result.error?.message).toContain('PS_ADMIN_TOKEN');
    expect(authentication.setToken).not.toHaveBeenCalled();
  });

  it('stores token in insecure storage when --token and --force-insecure are provided', async () => {
    Services.storage = {
      capabilities: { supportsSecureStorage: false },
      insecureStoragePath: '/tmp/powersync-config.json'
    } as unknown as StorageImpl;

    const result = await runLoginWithArgs(['--token', 'abc', '--force-insecure']);

    expect(result.error).toBeUndefined();
    expect(authentication.setToken).toHaveBeenCalledWith('abc');
    expect(result.stdout).toContain('Token stored.');
  });

  it('errors when --token is empty/whitespace', async () => {
    const result = await runLoginWithArgs(['--token', '   ']);

    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain('Token is required.');
    expect(authentication.setToken).not.toHaveBeenCalled();
  });

  it('stores a valid token from prompt when browser flow is declined', async () => {
    mockedConfirm.mockResolvedValueOnce(true); // openBrowser
    mockedPassword.mockImplementationOnce(() => Object.assign(Promise.resolve('test-token'), { cancel: vi.fn() }));
    const result = await runLoginDirect();

    expect(result.error).toBeUndefined();
    expect(authentication.setToken).toHaveBeenCalledWith('server-token');
    expect(authentication.deleteToken).not.toHaveBeenCalled();
    expect(mockedStartPATLoginServer).toHaveBeenCalledTimes(1);
    expect(result.stdout).toContain('Token stored successfully.');
    expect(result.stdout).toContain('Token is valid.');
  });

  it('cancels login when secure storage is unavailable and fallback is declined', async () => {
    Services.storage = {
      capabilities: { supportsSecureStorage: false },
      insecureStoragePath: '/tmp/powersync-config.json'
    } as unknown as StorageImpl;
    mockedConfirm.mockResolvedValueOnce(false); // insecure fallback prompt

    const result = await runLoginDirect();

    expect(result.error?.oclif?.exit).toBe(0);
    expect(authentication.setToken).not.toHaveBeenCalled();
    expect(result.stdout).toContain('Login cancelled.');
  });

  it('deletes token and errors when token validation fails', async () => {
    mockedConfirm.mockResolvedValueOnce(true); // openBrowser
    mockedPassword.mockImplementationOnce(() => Object.assign(Promise.resolve('test-token'), { cancel: vi.fn() }));
    authentication.setToken.mockRejectedValueOnce(new Error('unauthorized'));

    const result = await runLoginDirect();

    expect(result.error).toBeDefined();
    expect(authentication.setToken).toHaveBeenCalledWith('server-token');
    expect(authentication.deleteToken).toHaveBeenCalledTimes(1);
    expect(result.error?.message).toContain('Invalid token. Please try again.');
  });

  it('uses browser token when prompt is aborted by race', async () => {
    mockedConfirm.mockResolvedValueOnce(true); // openBrowser
    mockedStartPATLoginServer.mockResolvedValue({
      address: 'http://127.0.0.1:54321',
      tokenPromise: Promise.resolve('server-token')
    });
    mockedPassword.mockImplementationOnce(
      (_opts, context?: { signal?: AbortSignal }) =>
        new Promise<string>((_resolve, reject) => {
          context?.signal?.addEventListener('abort', () => reject(new Error('AbortError')), { once: true });
        })
    );

    const result = await runLoginDirect();

    expect(result.error).toBeUndefined();
    expect(authentication.setToken).toHaveBeenCalledWith('server-token');
    expect(authentication.deleteToken).not.toHaveBeenCalled();
    expect(result.stdout).toContain('Token stored successfully.');
  });
});
