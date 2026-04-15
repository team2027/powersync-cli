import * as sdk from '@journeyapps-labs/common-sdk';
import { ux } from '@oclif/core';
import { PowerSyncManagementClient } from '@powersync/management-client';

import { Services } from '../services/Services.js';
import { env } from '../utils/env.js';
import { getCliClientHeadersStore } from './cli-client-headers.js';
import { getCliTokenOverride } from './cli-token-override.js';

/**
 * Creates a PowerSync Management Client for the Cloud.
 * Uses the token stored by the login command (secure storage, e.g. macOS Keychain).
 */
export function createCloudClient(): PowerSyncManagementClient {
  return new PowerSyncManagementClient({
    /**
     * Use the web network client rather than the node client. The node client
     * uses agentkeepalive to pool TCP connections across requests. When making
     * multiple requests from the same client, connection reuse can cause 400 Bad
     * Request errors if the server closes connections before the client's
     * freeSocketTimeout (30s). The web client uses fetch() which manages
     * connections differently and avoids this stale-connection issue.
     * Node.js exposes fetch as a global, so we can use it directly without importing it.
     */
    client: sdk.createWebNetworkClient({
      async headers() {
        const token = getCliTokenOverride() || env.PS_ADMIN_TOKEN || (await Services.authentication.getToken());
        if (!token) {
          throw new Error(
            `Not authenticated. Provide a PowerSync Personal Access Token via any of:\n` +
              `  - ${ux.colorize('blue', '--token=<pat>')} flag on the command\n` +
              `  - ${ux.colorize('blue', 'PS_ADMIN_TOKEN')} environment variable\n` +
              `  - ${ux.colorize('blue', 'powersync login')} (stores token in secure storage)\n` +
              `Create a token at ${ux.colorize('blue', 'https://dashboard.powersync.com/dashboard/administration/personal-access-tokens')}.`
          );
        }

        return {
          ...getCliClientHeadersStore().headers,
          Authorization: `Bearer ${token}`
        };
      }
    }),
    endpoint: env._PS_MANAGEMENT_SERVICE_URL
  });
}
