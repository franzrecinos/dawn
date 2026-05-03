import * as p from '@clack/prompts';

export { p };

/**
 * Read-input that requires the user to type out an *exact* string. Used for
 * production confirmations — no copy-paste, no `--yes`, you type the domain.
 * Returns true if matched, false on cancel or mismatch.
 */
export async function typedConfirmation(promptText, expected) {
  const value = await p.text({
    message: promptText,
    placeholder: expected,
    validate: (input) => {
      if (!input) return 'Required.';
      if (input.trim() !== expected) return `Doesn't match. Expected: ${expected}`;
      return undefined;
    },
  });
  if (p.isCancel(value)) return false;
  return value.trim() === expected;
}

export async function confirm(message, defaultValue = false) {
  const value = await p.confirm({ message, initialValue: defaultValue });
  if (p.isCancel(value)) return false;
  return value;
}

export function bail(reason) {
  p.cancel(reason);
  process.exit(1);
}
