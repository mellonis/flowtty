import React, { useState, type ReactNode } from 'react';
import { Box, DialogHost, Text, useApp, useInput, useTerminalSize } from '@flowtty/react';
import { useAutopilot, type Autopilot } from './autopilot.js';
import { TempoContext } from './tempo.js';

export interface Scene { name: string; render: () => ReactNode }

export const FRAME = { width: 100, height: 30 } as const;

export interface AppProps { scenes: Scene[]; autopilot: Autopilot; speed?: number }

/** DialogHost + playback speed around the tour itself. */
export function App({ speed = 1, ...rest }: AppProps) {
  return (
    <TempoContext.Provider value={speed}>
      <DialogHost backdrop><Tour {...rest} /></DialogHost>
    </TempoContext.Provider>
  );
}

/** The showcase draws inside a fixed frame so it looks the same in every terminal — and in every recording. */
function Tour({ scenes, autopilot }: { scenes: Scene[]; autopilot: Autopilot }) {
  const { exit } = useApp();
  const size = useTerminalSize();
  const mode = useAutopilot(autopilot);
  const [index, setIndex] = useState(0);

  useInput((key) => {
    // F1…Fn jump to a scene (what the script uses); Ctrl+N / Ctrl+P step for people on a laptop keyboard.
    const fn = /^f(\d+)$/.exec(key.name);
    if (fn && Number(fn[1]) >= 1 && Number(fn[1]) <= scenes.length) setIndex(Number(fn[1]) - 1);
    else if (key.ctrl && key.name === 'n') setIndex((i) => (i + 1) % scenes.length);
    else if (key.ctrl && key.name === 'p') setIndex((i) => (i - 1 + scenes.length) % scenes.length);
    else if (key.ctrl && key.name === 'g') autopilot.play();
    else if (key.ctrl && key.name === 'q') exit();
  });

  if (size.width < FRAME.width || size.height < FRAME.height) {
    return (
      <Box flexDirection="column">
        <Text bold>flowtty showcase</Text>
        <Text>{`needs a ${FRAME.width}×${FRAME.height} terminal — this one is ${size.width}×${size.height}. Enlarge the window.`}</Text>
      </Box>
    );
  }

  const scene = scenes[index]!;
  const status = mode === 'playing' ? '▶ autopilot — press any key to take over'
    : mode === 'paused' ? '⏸ you have the keys — Ctrl+G hands them back'
      : mode === 'finished' ? '■ the script is done — it is all yours'
        : 'manual';
  return (
    <Box width="100%" height="100%" justifyContent="center" alignItems="center">
      {/* overflow="hidden": whatever a scene does, it cannot draw over the frame or past it. */}
      <Box flexDirection="column" width={FRAME.width} height={FRAME.height} border="round" borderTitle=" flowtty showcase " paddingX={1} overflow="hidden">
        <Box flexDirection="row" gap={2}>
          {scenes.map((s, i) => (
            <Text key={s.name} bold={i === index} color={i === index ? 'cyan' : undefined} dim={i !== index}>
              {`F${i + 1} ${s.name}`}
            </Text>
          ))}
        </Box>
        <Text>{''}</Text>
        {/* keyed by scene: switching remounts it, so every visit starts from a clean state */}
        <Box key={scene.name} flexDirection="column" flexGrow={1} flexShrink={1}>{scene.render()}</Box>
        <Box flexDirection="row" justifyContent="space-between">
          <Text dim>{status}</Text>
          <Text dim>Ctrl+N / Ctrl+P scenes · Ctrl+Q quit</Text>
        </Box>
      </Box>
    </Box>
  );
}
