import { useCallback, useState } from 'react';

/**
 * Whether the pointer is over the box the returned props are spread on, and
 * the props to spread: `const [hovered, hover] = useHover();
 * <Text {...hover} dim={!hovered}>`. The component re-renders on enter and
 * on leave, never on a move inside. Needs the backend's `mouse: { hover:
 * true }`; without it `hovered` stays false. See docs/input.md (clicks and hover).
 */
export function useHover(): [boolean, { onHoverChange: (hovered: boolean) => void }] {
  const [hovered, setHovered] = useState(false);
  const onHoverChange = useCallback((next: boolean) => { setHovered((prev) => (prev === next ? prev : next)); }, []);
  return [hovered, { onHoverChange }];
}
