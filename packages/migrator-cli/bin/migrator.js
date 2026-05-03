#!/usr/bin/env node
import { run } from '../src/index.js';

run(process.argv).catch((err) => {
  // Top-level catch so any synchronous import error or uncaught rejection
  // surfaces with a clean stack instead of an unhandled-rejection warning.
  // eslint-disable-next-line no-console
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
