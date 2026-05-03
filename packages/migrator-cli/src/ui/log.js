import pc from 'picocolors';

export const log = {
  info: (msg) => console.log(`${pc.cyan('•')} ${msg}`),
  ok: (msg) => console.log(`${pc.green('✓')} ${msg}`),
  warn: (msg) => console.warn(`${pc.yellow('!')} ${pc.yellow(msg)}`),
  err: (msg) => console.error(`${pc.red('✗')} ${pc.red(msg)}`),
  dim: (msg) => console.log(pc.dim(msg)),
  step: (label, msg) => console.log(`${pc.dim(`[${label}]`)} ${msg}`),
  raw: (msg) => console.log(msg),
};

export { pc };
