// The named colors every backend understands: the 8 ANSI colors, their bright
// variants, and `gray` / `grey` as the familiar names for bright black. Core owns
// the NAMES; a backend owns how to emit them, and types its table as
// `Record<NamedColor, …>` so a name added here fails to compile until the
// backend covers it.
export const NAMED_COLORS = [
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'gray', 'grey',
  'blackBright', 'redBright', 'greenBright', 'yellowBright',
  'blueBright', 'magentaBright', 'cyanBright', 'whiteBright',
] as const;

export type NamedColor = typeof NAMED_COLORS[number];

/**
 * A color value: a named color, or any string for the other accepted forms —
 * `#rgb`, `#rrggbb`, `rgb(r, g, b)`. The `string & {}` arm keeps those valid
 * while editors still complete the names. It cannot reject a misspelled name;
 * the TTY backends report unknown names when they exit.
 */
export type Color = NamedColor | (string & {});
