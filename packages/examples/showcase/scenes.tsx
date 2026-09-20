import React from 'react';
import type { Scene } from './App.js';
import { LayoutScene } from './scenes/LayoutScene.js';
import { FormScene } from './scenes/FormScene.js';
import { DataScene } from './scenes/DataScene.js';
import { ProgressScene } from './scenes/ProgressScene.js';
import { ChatScene } from './scenes/ChatScene.js';
import { DialogScene } from './scenes/DialogScene.js';
import { SnakeScene } from './scenes/SnakeScene.js';

// F-key order = the order of the tour.
export const SCENES: Scene[] = [
  { name: 'layout', render: () => <LayoutScene /> },
  { name: 'form', render: () => <FormScene /> },
  { name: 'data', render: () => <DataScene /> },
  { name: 'progress', render: () => <ProgressScene /> },
  { name: 'chat', render: () => <ChatScene /> },
  { name: 'dialog', render: () => <DialogScene /> },
  { name: 'snake', render: () => <SnakeScene /> },
];
