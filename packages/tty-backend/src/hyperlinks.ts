// OSC 8 hyperlink support is a property of the *terminal emulator*, not of
// stdout being a TTY — and there's no escape-sequence query to ask for it. So we
// sniff the environment the way the `supports-hyperlinks` package does: an
// explicit override wins, then a small allowlist of terminals known to honor
// OSC 8. Notably absent: Apple Terminal.app, which ignores OSC 8 entirely and
// only auto-detects bare URLs in text.

function truthyOverride(v: string): boolean {
  const s = v.trim().toLowerCase();
  return !(s === '0' || s === 'false' || s === 'no' || s === 'off');
}

/**
 * Best-effort detection of OSC 8 hyperlink support from the environment.
 * `FORCE_HYPERLINK`/`FORCE_HYPERLINKS` override everything (set to `0`/`false`
 * to force-disable, any other value to force-enable). Otherwise a known-good
 * terminal allowlist decides. Backends use this to set their `hyperlinks`
 * capability flag honestly so `<Link>` can fall back to a printed URL where
 * clicking won't work.
 */
export function detectHyperlinkSupport(env: NodeJS.ProcessEnv = process.env): boolean {
  const forced = env.FORCE_HYPERLINKS ?? env.FORCE_HYPERLINK;
  if (forced !== undefined) return truthyOverride(forced);

  // VTE-based terminals (GNOME Terminal, Tilix, …) advertise a version; OSC 8
  // shipped in VTE 0.50.0 → VTE_VERSION 5000.
  const vte = Number(env.VTE_VERSION);
  if (Number.isFinite(vte) && vte >= 5000) return true;

  if (env.WT_SESSION) return true; // Windows Terminal
  if (env.DOMTERM) return true;    // DomTerm

  switch (env.TERM_PROGRAM) {
    case 'iTerm.app':
    case 'WezTerm':
    case 'ghostty':
    case 'Hyper':
    case 'vscode':
    case 'rio':
      return true;
    default:
      return false; // includes Apple_Terminal and unknown/unset
  }
}
