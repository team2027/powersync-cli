import { Config } from '@oclif/core';
import { captureOutput } from '@oclif/test';
import { Services } from '@powersync/cli-core';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import FetchProjectsCommand from '../../../src/commands/fetch/projects.js';
import { root } from '../../helpers/root.js';
import { managementClientMock, MOCK_CLOUD_IDS } from '../../setup.js';

describe('fetch projects', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let oclifConfig: Config;

  beforeAll(async () => {
    oclifConfig = await Config.load({ root });
  });

  beforeEach(() => {
    vi.spyOn(Services.authentication, 'getToken').mockResolvedValue('stored-token');

    // Mock the accounts API responses (organizations and projects lists).
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/accounts/v5/organizations/list')) {
        return new Response(
          JSON.stringify({
            data: {
              count: 1,
              more: false,
              objects: [{ id: MOCK_CLOUD_IDS.orgId, label: 'test-org' }],
              total: 1
            }
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 }
        );
      }

      if (url.includes('/api/accounts/v5/apps/list')) {
        return new Response(
          JSON.stringify({
            data: {
              count: 2,
              more: false,
              objects: [
                { id: MOCK_CLOUD_IDS.projectId, name: 'alpha-project' },
                { id: '699ef9c371c56d0007320544', name: 'beta-project' }
              ],
              total: 2
            }
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 }
        );
      }

      return new Response(JSON.stringify({ data: {} }), {
        headers: { 'content-type': 'application/json' },
        status: 200
      });
    });

    managementClientMock.listInstances = vi.fn().mockResolvedValue({ instances: [{ id: 'a' }, { id: 'b' }] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete managementClientMock.listInstances;
  });

  function runDirect(args: string[]) {
    const cmd = new FetchProjectsCommand(args, oclifConfig);
    return captureOutput(() => cmd.run());
  }

  it('lists projects in human format by default', async () => {
    const result = await runDirect(['--no-include-instance-count']);
    expect(result.error).toBeUndefined();
    expect(result.stdout).toContain('Organization:');
    expect(result.stdout).toContain('test-org');
    expect(result.stdout).toContain('alpha-project');
    expect(result.stdout).toContain('beta-project');
    expect(result.stdout).toContain(MOCK_CLOUD_IDS.projectId);
  });

  it('returns JSON when --output=json', async () => {
    const result = await runDirect(['--output', 'json', '--no-include-instance-count']);
    expect(result.error).toBeUndefined();

    const parsed = JSON.parse(result.stdout) as {
      projects: Array<{ id: string; instance_count: number; name: string; org_id: string; org_name: string }>;
    };
    expect(parsed.projects).toHaveLength(2);
    expect(parsed.projects[0]).toMatchObject({
      id: MOCK_CLOUD_IDS.projectId,
      instance_count: 0,
      name: 'alpha-project',
      org_id: MOCK_CLOUD_IDS.orgId,
      org_name: 'test-org'
    });
  });

  it('passes --token to the API via authorization header', async () => {
    const result = await runDirect([
      '--token',
      'override-token',
      '--output',
      'json',
      '--no-include-instance-count'
    ]);
    expect(result.error).toBeUndefined();

    const accountsCall = (fetchSpy.mock.calls as Array<[unknown, { headers?: Record<string, string> }?]>).find(
      ([input]) => {
        const url = typeof input === 'string' ? input : String(input);
        return url.includes('/api/accounts/');
      }
    );
    expect(accountsCall).toBeDefined();
    const headers = new Headers(accountsCall?.[1]?.headers);
    expect(headers.get('authorization')).toEqual('Bearer override-token');
  });
});
