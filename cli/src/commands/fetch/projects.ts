import { Command, Flags, ux } from '@oclif/core';
import {
  authTokenFlag,
  CommandHelpGroup,
  createAccountsHubClient,
  createCloudClient,
  setCliTokenOverride
} from '@powersync/cli-core';
import sortBy from 'lodash/sortBy.js';
import fs from 'node:fs/promises';
import ora from 'ora';

type ProjectRow = {
  id: string;
  instance_count: number;
  name: string;
  org_id: string;
  org_name: string;
};

export default class FetchProjects extends Command {
  static commandHelpGroup = CommandHelpGroup.CLOUD;
  static description =
    'List PowerSync Cloud projects the authenticated token has access to, grouped by organization. Use this to discover the project-id needed for `link cloud`, `fetch instances`, and other Cloud commands without opening the dashboard.';
  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --output=json',
    '<%= config.bin %> <%= command.id %> --org-id=<id> --output=json',
    '<%= config.bin %> <%= command.id %> --token=jpt_xxx --output=json'
  ];
  static flags = {
    ...authTokenFlag,
    'include-instance-count': Flags.boolean({
      allowNo: true,
      default: true,
      description:
        'Include the number of instances for each project (one extra API call per project). Use --no-include-instance-count to skip.'
    }),
    'org-id': Flags.string({
      description: 'Optional Organization ID. Defaults to all organizations the token can access.',
      required: false
    }),
    output: Flags.string({
      default: 'human',
      description: 'Output format: human or json.',
      options: ['human', 'json']
    }),
    'output-file': Flags.string({
      description: 'Optionally write project information to a file.',
      required: false
    })
  };
  static summary = 'List Cloud projects (id, name, org, instance count).';

  async run(): Promise<void> {
    const { flags } = await this.parse(FetchProjects);

    setCliTokenOverride(flags.token);

    const accountsClient = createAccountsHubClient();
    const managementClient = createCloudClient();

    const rows: ProjectRow[] = [];
    // In JSON mode, progress must not pollute stdout; route spinner to stderr and skip when not TTY.
    const jsonMode = flags.output === 'json';
    const spinner = ora({
      discardStdin: false,
      isEnabled: !jsonMode && process.stderr.isTTY,
      stream: process.stderr,
      text: 'Fetching projects...'
    });

    let spinnerStarted = false;
    try {
      for await (const orgPage of accountsClient.listOrganizations.paginate({ id: flags['org-id'] })) {
        const { objects: organizations, total: totalOrgs } = orgPage;
        if (!spinnerStarted && totalOrgs > 0) {
          spinner.start();
          spinnerStarted = true;
        }

        for (const organization of organizations) {
          spinner.text = `Fetching projects in ${organization.label}...`;
          for await (const projectPage of accountsClient.listProjects.paginate({
            org_id: organization.id
          })) {
            for (const project of projectPage.objects) {
              let instance_count = 0;
              if (flags['include-instance-count']) {
                const instances = await managementClient.listInstances({
                  app_id: project.id,
                  org_id: organization.id
                });
                instance_count = instances.instances.length;
              }

              rows.push({
                id: project.id,
                instance_count,
                name: project.name,
                org_id: organization.id,
                org_name: organization.label
              });
            }
          }
        }
      }
    } finally {
      if (spinnerStarted) {
        spinner.stop();
      }
    }

    const sorted = sortBy(rows, ['org_name', 'name']);

    if (flags.output === 'human') {
      this.log('');
      if (sorted.length === 0) {
        this.log('No projects found for the authenticated token.');
      } else {
        let currentOrgId = '';
        for (const row of sorted) {
          if (row.org_id !== currentOrgId) {
            this.log(
              `${ux.colorize('blue', 'Organization: ')} ${row.org_name} ${ux.colorize('gray', `id: ${row.org_id}`)}`
            );
            currentOrgId = row.org_id;
          }

          const instanceLabel = flags['include-instance-count']
            ? ` ${ux.colorize('gray', `instances: ${row.instance_count}`)}`
            : '';
          this.log(
            `\t${ux.colorize('blue', 'Project: ')} ${row.name} ${ux.colorize('gray', `id: ${row.id}`)}${instanceLabel}`
          );
        }
      }

      this.log('');
    }

    const outputObject = { projects: sorted };

    if (flags.output === 'json' || flags['output-file']) {
      // Plain JSON (no ANSI colors) so it can be piped into jq, file, etc. without post-processing.
      const content = JSON.stringify(outputObject, null, 2);
      if (flags.output === 'json') {
        this.log(content);
      }

      if (flags['output-file']) {
        await fs.writeFile(flags['output-file'], content);
      }
    }
  }
}
