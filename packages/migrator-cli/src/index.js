import { cac } from 'cac';
import { init } from './commands/init.js';
import * as stores from './commands/stores.js';
import { copy } from './commands/copy.js';
import { listEntities } from './entities/index.js';
import { log } from './ui/log.js';
import { auditLogLocation } from './registry/audit.js';

export async function run(argv) {
  const cli = cac('migrator');

  cli
    .command('init', 'Create migrator.config.json in the current directory.')
    .action(init);

  cli
    .command('stores add [alias]', 'Add or update an access token for a configured store.')
    .action(stores.add);

  cli.command('stores list', 'List configured stores and credential status.').action(stores.list);

  cli
    .command('stores remove <alias>', 'Forget the access token for a store (config entry stays).')
    .action(stores.remove);

  cli
    .command('copy <entity>', `Diff & migrate an entity. Available: ${listEntities().join(', ')}.`)
    .option('--from <alias>', 'Source store alias (from migrator.config.json).')
    .option('--to <alias>', 'Target store alias.')
    .option('--apply', 'Write changes. Without this, runs as a dry-run plan.')
    .option('--allow-production', 'Required when --to targets a role:production store.')
    .option('--yes', 'Skip the post-plan confirmation. Rejected for production targets.')
    .action((entity, options) => copy(entity, options));

  cli.command('plan <entity>', 'Alias for `copy <entity>` without --apply (always dry-run).').action(
    (entity, options) => copy(entity, { ...options, apply: false })
  );

  cli.command('audit-log', 'Print the path of the global audit log.').action(() => {
    log.raw(auditLogLocation());
  });

  cli.help();
  cli.version(readPackageVersion());

  cli.parse(argv, { run: false });

  // cac stores parse failures internally — bail if no command matched and no
  // help was requested.
  if (!cli.matchedCommand && !cli.options.help && !cli.options.version) {
    cli.outputHelp();
    return;
  }

  await cli.runMatchedCommand();
}

function readPackageVersion() {
  // Hard-coded for now; importing JSON in pure ESM is fiddly across Node
  // versions and not worth the ceremony for a version string.
  return '0.1.0';
}
