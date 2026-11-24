import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject } from '../data/presets';
import {
  buildDesktopPackageFiles,
  buildDesktopPackageZip,
  PACKAGE_ROOT_FOLDER,
} from './desktopPackager';

test('buildDesktopPackageFiles includes all installer, TikTok guide, local server, offline app, and preset JSON files', () => {
  const project = createDefaultProject();
  const files = buildDesktopPackageFiles({
    project,
    roomId: 'live-shop99',
    serverOrigin: 'https://live.example.com',
    tikfinityUrl: 'ws://localhost:21213',
  });

  const paths = files.map((f) => f.relativePath);
  assert.equal(paths.includes('1_CAI_DAT_VA_TAO_ICON_DESKTOP.bat'), true);
  assert.equal(paths.includes('2_CHAY_BANG_DIEU_KHIEN_LIVE.bat'), true);
  assert.equal(paths.includes('3_MO_OUTPUT_CO_CAMERA_RIENG.bat'), true);
  assert.equal(paths.includes('4_CHAY_LOCAL_OFFLINE_KHONG_CAN_MANG.bat'), true);
  assert.equal(paths.includes('CHAY_TREN_MAC.command'), true);
  assert.equal(paths.includes('HUONG_DAN_TIKTOK_LIVE_STUDIO.html'), true);
  assert.equal(paths.includes('LINK_TIKTOK_LIVE_STUDIO.txt'), true);
  assert.equal(paths.includes('README_HUONG_DAN_NHANH.txt'), true);
  assert.equal(paths.includes('app/PocketLive_Offline_Player.html'), true);
  assert.equal(paths.includes('app/pocketlive-local-server.mjs'), true);
  assert.equal(paths.includes('data/project-preset.json'), true);

  // Check room URL injection in installer and TikTok guide
  const installBat = files.find((f) => f.relativePath === '1_CAI_DAT_VA_TAO_ICON_DESKTOP.bat')!;
  assert.equal(installBat.content.includes('https://live.example.com/?view=output&room=live-shop99'), true);
  assert.equal(installBat.content.includes('\r\n'), true);

  const guideHtml = files.find((f) => f.relativePath === 'HUONG_DAN_TIKTOK_LIVE_STUDIO.html')!;
  assert.equal(guideHtml.content.includes('1080'), true);
  assert.equal(guideHtml.content.includes('1920'), true);
  assert.equal(guideHtml.content.includes('TikTok LIVE Studio'), true);
  assert.equal(guideHtml.content.includes('live-shop99'), true);
});

test('buildDesktopPackageZip creates a valid non-empty zip archive prefixed with root folder', () => {
  const project = createDefaultProject();
  const pkg = buildDesktopPackageZip({
    project,
    roomId: 'live-vip',
    serverOrigin: 'http://localhost:3000',
  });

  assert.equal(pkg.filename.startsWith('PocketLive-Studio-Package-live-vip-'), true);
  assert.equal(pkg.filename.endsWith('.zip'), true);
  assert.equal(pkg.bytes[0], 0x50);
  assert.equal(pkg.bytes[1], 0x4b);
  assert.equal(pkg.bytes.length > 5000, true);

  const text = new TextDecoder().decode(pkg.bytes);
  assert.equal(text.includes(`${PACKAGE_ROOT_FOLDER}/1_CAI_DAT_VA_TAO_ICON_DESKTOP.bat`), true);
  assert.equal(text.includes(`${PACKAGE_ROOT_FOLDER}/app/pocketlive-local-server.mjs`), true);
});
