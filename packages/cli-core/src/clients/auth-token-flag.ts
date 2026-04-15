import { Flags } from '@oclif/core';

/**
 * Reusable `--token` flag that accepts a PowerSync Personal Access Token inline.
 *
 * Precedence when resolving auth:
 *   1. `--token` flag (this flag, via `setCliTokenOverride(flags.token)`)
 *   2. `PS_ADMIN_TOKEN` env var
 *   3. Token stored via `powersync login`
 *
 * Commands that touch the Cloud API should spread this into their `flags` and pass the
 * value to `setCliTokenOverride` before making any authenticated calls.
 */
export const authTokenFlag = {
  token: Flags.string({
    description:
      'PowerSync Personal Access Token (PAT). Overrides PS_ADMIN_TOKEN env var and the token stored via `powersync login`. Create one at https://dashboard.powersync.com/dashboard/administration/personal-access-tokens.',
    required: false
  })
};
