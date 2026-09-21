// Developer warnings that must not be printed while a frame is on screen — a
// line written mid-frame corrupts the display. They are collected here (each
// message once) and a backend prints them when it is safe: after it has left the
// alt screen / live region.
const pending = new Set<string>();

export function noteWarning(message: string): void {
  pending.add(message);
}

/** Warnings noted since the last call; clears the list. */
export function takeWarnings(): string[] {
  const out = [...pending];
  pending.clear();
  return out;
}
