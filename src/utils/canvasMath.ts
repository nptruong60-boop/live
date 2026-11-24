import type { CanvasElement, DepthLayer } from '../types/studio';

export const STAGE_W = 360;
export const STAGE_H = 640;

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapGuide {
  axis: 'x' | 'y';
  position: number;
  label?: string;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: SnapGuide[];
}

const LAYER_ORDER: Record<DepthLayer, number> = {
  background: 0,
  midground: 1,
  foreground: 2,
};

/**
 * Sorts elements strictly by depth layer (Background -> Midground -> Foreground)
 * and then ascending by zIndex within each layer.
 */
export function sortElementsByRenderOrder(elements: CanvasElement[]): CanvasElement[] {
  return [...elements].sort((a, b) => {
    const layerDiff = LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer];
    if (layerDiff !== 0) return layerDiff;
    return a.zIndex - b.zIndex;
  });
}

/**
 * Computes Canva-style smart snapping for a moving box against stage centerlines,
 * TikTok safe-zone boundaries, and visible sibling element edges/centers.
 */
export function computeSmartSnap(
  moving: Box,
  siblings: Box[],
  stageW = STAGE_W,
  stageH = STAGE_H,
  threshold = 5
): SnapResult {
  const xTargets: Array<{ value: number; label?: string }> = [
    { value: 0 },
    { value: 12, label: 'Safe L' },
    { value: stageW / 2, label: 'Giữa' },
    { value: stageW - 12, label: 'Safe R' },
    { value: stageW },
  ];

  const yTargets: Array<{ value: number; label?: string }> = [
    { value: 0 },
    { value: Math.round(stageH * 0.075), label: 'TikTok Top' },
    { value: stageH / 2, label: 'Giữa' },
    { value: stageH - 14, label: 'Safe B' },
    { value: stageH },
  ];

  for (const s of siblings) {
    xTargets.push({ value: s.x }, { value: s.x + s.width / 2 }, { value: s.x + s.width });
    yTargets.push({ value: s.y }, { value: s.y + s.height / 2 }, { value: s.y + s.height });
  }

  let bestDx = threshold + 1;
  let snappedX = moving.x;
  let guideX: SnapGuide | null = null;

  const movingXPoints = [
    { offset: 0, val: moving.x },
    { offset: moving.width / 2, val: moving.x + moving.width / 2 },
    { offset: moving.width, val: moving.x + moving.width },
  ];

  for (const pt of movingXPoints) {
    for (const target of xTargets) {
      const dist = Math.abs(pt.val - target.value);
      if (dist <= threshold && dist < bestDx) {
        bestDx = dist;
        snappedX = Math.round(target.value - pt.offset);
        guideX = { axis: 'x', position: target.value, label: target.label };
      }
    }
  }

  let bestDy = threshold + 1;
  let snappedY = moving.y;
  let guideY: SnapGuide | null = null;

  const movingYPoints = [
    { offset: 0, val: moving.y },
    { offset: moving.height / 2, val: moving.y + moving.height / 2 },
    { offset: moving.height, val: moving.y + moving.height },
  ];

  for (const pt of movingYPoints) {
    for (const target of yTargets) {
      const dist = Math.abs(pt.val - target.value);
      if (dist <= threshold && dist < bestDy) {
        bestDy = dist;
        snappedY = Math.round(target.value - pt.offset);
        guideY = { axis: 'y', position: target.value, label: target.label };
      }
    }
  }

  const guides: SnapGuide[] = [];
  if (guideX) guides.push(guideX);
  if (guideY) guides.push(guideY);

  return { x: snappedX, y: snappedY, guides };
}

/**
 * Computes new bounding box from an 8-point Canva resize drag handle.
 */
export function computeResizedBox(
  start: Box,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  minW = 36,
  minH = 24,
  keepAspect = false
): Box {
  let x = start.x;
  let y = start.y;
  let width = start.width;
  let height = start.height;

  const affectsWest = handle.includes('w');
  const affectsEast = handle.includes('e');
  const affectsNorth = handle.includes('n');
  const affectsSouth = handle.includes('s');

  if (affectsEast) {
    width = Math.max(minW, start.width + dx);
  }
  if (affectsWest) {
    const nextW = Math.max(minW, start.width - dx);
    x = start.x + (start.width - nextW);
    width = nextW;
  }
  if (affectsSouth) {
    height = Math.max(minH, start.height + dy);
  }
  if (affectsNorth) {
    const nextH = Math.max(minH, start.height - dy);
    y = start.y + (start.height - nextH);
    height = nextH;
  }

  if (keepAspect && start.width > 0 && start.height > 0 && handle.length === 2) {
    const aspect = start.width / start.height;
    const scaleW = width / start.width;
    const scaleH = height / start.height;
    if (Math.abs(scaleW - 1) >= Math.abs(scaleH - 1)) {
      const nextH = Math.max(minH, Math.round(width / aspect));
      if (affectsNorth) y = start.y + (start.height - nextH);
      height = nextH;
    } else {
      const nextW = Math.max(minW, Math.round(height * aspect));
      if (affectsWest) x = start.x + (start.width - nextW);
      width = nextW;
    }
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export function createHistory<T>(initial: T): HistoryState<T> {
  return { past: [], present: initial, future: [] };
}

export function pushHistory<T>(state: HistoryState<T>, next: T, maxPast = 30): HistoryState<T> {
  const past = [...state.past, state.present];
  if (past.length > maxPast) past.shift();
  return { past, present: next, future: [] };
}

export function undoHistory<T>(state: HistoryState<T>): HistoryState<T> {
  if (state.past.length === 0) return state;
  const previous = state.past[state.past.length - 1];
  return {
    past: state.past.slice(0, -1),
    present: previous,
    future: [state.present, ...state.future],
  };
}

export function redoHistory<T>(state: HistoryState<T>): HistoryState<T> {
  if (state.future.length === 0) return state;
  const next = state.future[0];
  return {
    past: [...state.past, state.present],
    present: next,
    future: state.future.slice(1),
  };
}
