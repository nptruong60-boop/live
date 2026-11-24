import test from 'node:test';
import assert from 'node:assert/strict';
import { generateStandaloneLiveHtml } from './standaloneExporter';
import type { StudioProject } from '../types/studio';

test('generateStandaloneLiveHtml produces valid self-contained HTML and escapes script breakout', () => {
  const project: StudioProject = {
    id: 'proj-1',
    name: 'Live Test </script><script>alert(1)</script>',
    updatedAt: '2026-11-24T00:00:00.000Z',
    activeSceneId: 's1',
    scenes: [
      {
        id: 's1',
        name: 'Scene 1',
        tag: 'Test',
        glassFinish: 'light',
        glassBlur: 18,
        glassOpacity: 68,
        accentColor: '#4f46e5',
        accentColor2: '#818cf8',
        backdrop: 'white-studio',
        backdropColor: '#ffffff',
        ambientType: 'none',
        ambientDensity: 15,
        elements: [],
      },
    ],
    products: [
      {
        id: 'p1',
        code: 'MÃ 01',
        name: 'Serum B5 </script>',
        tags: ['Freeship'],
        originalPrice: 400000,
        livePrice: 250000,
        svgType: 'serum-amber',
        customImage: '',
      },
    ],
    assets: [],
  };

  const html = generateStandaloneLiveHtml(project);
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(html.includes('PROJECT = '));
  // Ensure embedded JSON cannot break out of <script>
  assert.equal(html.includes('Serum B5 </script>'), false);
  assert.ok(html.includes('Serum B5 \\u003c/script\\u003e'));
});
