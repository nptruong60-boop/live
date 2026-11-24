import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSmartSnap,
  computeResizedBox,
  sortElementsByRenderOrder,
  createHistory,
  pushHistory,
  undoHistory,
  redoHistory,
  STAGE_W,
  STAGE_H,
} from './canvasMath';
import type { CanvasElement } from '../types/studio';

test('computeSmartSnap snaps horizontally to canvas center', () => {
  const moving = { x: 132, y: 100, width: 100, height: 50 }; // center is 182 (within 5px of 180)
  const result = computeSmartSnap(moving, [], STAGE_W, STAGE_H, 5);
  assert.equal(result.x, 130); // center is now exactly 180
  assert.equal(result.guides.some((g) => g.axis === 'x' && g.position === 180), true);
});

test('computeSmartSnap snaps to sibling element left edge and top edge', () => {
  const sibling = { x: 40, y: 200, width: 120, height: 60 };
  const moving = { x: 43, y: 197, width: 80, height: 40 };
  const result = computeSmartSnap(moving, [sibling], STAGE_W, STAGE_H, 5);
  assert.equal(result.x, 40);
  assert.equal(result.y, 200);
  assert.equal(result.guides.length, 2);
});

test('computeResizedBox enforces minimum width/height and preserves anchor on nw drag', () => {
  const start = { x: 100, y: 100, width: 100, height: 80 };
  const resized = computeResizedBox(start, 'nw', 90, 70, 40, 30, false);
  assert.equal(resized.width, 40);
  assert.equal(resized.height, 30);
  assert.equal(resized.x, 160);
  assert.equal(resized.y, 150);
});

test('computeResizedBox keeps aspect ratio on corner drag when keepAspect is true', () => {
  const start = { x: 20, y: 20, width: 100, height: 50 }; // 2:1 aspect
  const resized = computeResizedBox(start, 'se', 60, 10, 20, 20, true);
  assert.equal(resized.width, 160);
  assert.equal(resized.height, 80);
});

test('sortElementsByRenderOrder orders background -> midground -> foreground regardless of zIndex', () => {
  const mk = (id: string, layer: CanvasElement['layer'], zIndex: number): CanvasElement => ({
    id,
    name: id,
    kind: 'image',
    layer,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    zIndex,
    locked: false,
    visible: true,
    props: {},
  });

  const sorted = sortElementsByRenderOrder([
    mk('fg-2', 'foreground', 10),
    mk('bg-high', 'background', 99),
    mk('mid-1', 'midground', 1),
    mk('fg-1', 'foreground', 2),
  ]);

  assert.deepEqual(
    sorted.map((e) => e.id),
    ['bg-high', 'mid-1', 'fg-1', 'fg-2']
  );
});

test('history stack supports push, undo, redo, and clears future on new push', () => {
  let h = createHistory('v1');
  h = pushHistory(h, 'v2');
  h = pushHistory(h, 'v3');
  assert.equal(h.present, 'v3');

  h = undoHistory(h);
  assert.equal(h.present, 'v2');

  h = redoHistory(h);
  assert.equal(h.present, 'v3');

  h = undoHistory(h);
  h = pushHistory(h, 'v2b');
  assert.equal(h.present, 'v2b');
  assert.equal(h.future.length, 0);
});
