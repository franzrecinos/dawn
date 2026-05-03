import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

/**
 * Append-only audit log. JSON-lines at ~/.config/nomeo-migrator/audit.log.
 * Survives terminal close. Every destructive command (and every refusal-to-act
 * by a safeguard) writes one line.
 */

function logPath() {
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(xdg, 'nomeo-migrator', 'audit.log');
}

export async function audit(event) {
  const file = logPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const line =
    JSON.stringify({
      ts: new Date().toISOString(),
      operator: process.env.USER || process.env.USERNAME || 'unknown',
      pid: process.pid,
      ...event,
    }) + '\n';
  await fs.appendFile(file, line, 'utf8');
}

export const auditLogLocation = logPath;
