import { createContext, type Context } from 'react';
import type { Rect } from '@flowtty/core/host';

/** Ask the nearest `<ScrollBox>` to bring a rect — frame cells, as `onLayout`
 *  reports them — into view: the least scroll that shows it whole, its top
 *  when it is taller than the viewport. A no-op outside a ScrollBox. What
 *  `useFocus()` calls for the focused component. See docs/input.md (focus +
 *  Button). */
export type RevealRect = (rect: Rect) => void;

export const ScrollRevealContext: Context<RevealRect> = createContext<RevealRect>(() => {});
