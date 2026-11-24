import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  ArrowDown,
  ArrowUp,
  Camera,
  Copy,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Lock,
  Magnet,
  Maximize2,
  Package,
  Plus,
  Redo2,
  Save,
  Shield,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  Unlock,
  Upload,
} from 'lucide-react';
import type {
  AmbientFxType,
  BackdropMode,
  CanvasElement,
  DepthLayer,
  ElementKind,
  LiveComment,
  LiveRuntimeState,
  Product,
  Scene,
  StudioProject,
  UploadedAsset,
} from '../types/studio';
import {
  STAGE_H,
  STAGE_W,
  computeResizedBox,
  computeSmartSnap,
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
  type ResizeHandle,
  type SnapGuide,
} from '../utils/canvasMath';
import {
  ACCENT_SWATCHES,
  createElementTemplate,
} from '../data/presets';
import { compressUploadedImage } from '../utils/imageCompress';
import { formatVND, lightenHex } from '../utils/format';
import { StageRenderer } from './StageRenderer';
import { ProductVisual } from './ProductVisual';

interface CanvaEditorProps {
  savedProject: StudioProject;
  live: LiveRuntimeState;
  pinnedComment: LiveComment | null;
  cameraStream: MediaStream | null;
  cameraMirrored: boolean;
  onToggleCamera: () => void;
  onToggleSafeZone: () => void;
  onPublishProject: (project: StudioProject) => Promise<void>;
  onSwitchToLive: () => void;
  onNotify: (msg: string, tone?: 'emerald' | 'amber' | 'rose' | 'indigo') => void;
}

type LeftTab = 'elements' | 'uploads' | 'scenes' | 'products';

const ELEMENT_PALETTE: Array<{
  kind: ElementKind;
  label: string;
  desc: string;
}> = [
  { kind: 'header', label: 'Tiêu đề Chiến dịch', desc: 'Banner tên shop & Siêu Sale' },
  { kind: 'product-spotlight', label: 'Thẻ SP Tiêu Điểm', desc: 'Tự đổi theo mã SP khi Live' },
  { kind: 'product-shelf', label: 'Kệ 3 Sản Phẩm Ngang', desc: 'Hiển thị 3 deal như studio lớn' },
  { kind: 'product-pill', label: 'Thanh Deal Viên Thuốc', desc: 'Gọn gàng, không che người' },
  { kind: 'voucher', label: 'Thẻ Voucher / Quà', desc: 'Vé giảm giá & mua 1 tặng 3' },
  { kind: 'flash-timer', label: 'Đồng hồ Flash Sale', desc: 'Đếm ngược giờ vàng tự động' },
  { kind: 'host-tag', label: 'Thẻ Host / Follow', desc: 'Tên Host tư vấn & kêu gọi Follow' },
  { kind: 'trust-bar', label: 'Thanh Quyền Lợi 3 Cột', desc: 'Freeship · Voucher · Kiểm hàng' },
  { kind: 'pinned-comment', label: 'Khung Ghim Comment', desc: 'Hiện câu hỏi khách lên màn Live' },
  { kind: 'text', label: 'Khối Chữ Tùy Chỉnh', desc: 'Nhãn giá, CTA hoặc ghi chú' },
];

const LAYER_META: Array<{ id: DepthLayer; label: string; hint: string }> = [
  { id: 'foreground', label: 'Tiền cảnh (Trước Host)', hint: 'Thẻ SP, Voucher, Bàn, Khung gương' },
  { id: 'midground', label: 'Trung cảnh (Sau Host)', hint: 'Kệ hàng, Mascot, Đèn cột' },
  { id: 'background', label: 'Nền (Background)', hint: 'Ảnh phông nền toàn màn 9:16' },
];

export const CanvaEditor: React.FC<CanvaEditorProps> = ({
  savedProject,
  live,
  pinnedComment,
  cameraStream,
  cameraMirrored,
  onToggleCamera,
  onToggleSafeZone,
  onPublishProject,
  onSwitchToLive,
  onNotify,
}) => {
  const [history, setHistory] = useState(() => createHistory<StudioProject>(savedProject));
  const draft = history.present;

  const [leftTab, setLeftTab] = useState<LeftTab>('elements');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadLayerTarget, setUploadLayerTarget] = useState<DepthLayer>('foreground');

  // Product form state
  const [editingProdId, setEditingProdId] = useState<string | null>(null);
  const [pCode, setPCode] = useState('');
  const [pName, setPName] = useState('');
  const [pTags, setPTags] = useState('');
  const [pOrig, setPOrig] = useState('');
  const [pLive, setPLive] = useState('');
  const [pImg, setPImg] = useState('');

  // Sync when external JSON import updates savedProject
  const lastSavedStampRef = useRef(savedProject.updatedAt);
  useEffect(() => {
    if (savedProject.updatedAt !== lastSavedStampRef.current) {
      lastSavedStampRef.current = savedProject.updatedAt;
      setHistory(createHistory(savedProject));
      setIsDirty(false);
    }
  }, [savedProject]);

  const activeScene = useMemo(
    () => draft.scenes.find((s) => s.id === draft.activeSceneId) || draft.scenes[0],
    [draft.activeSceneId, draft.scenes]
  );

  const selectedElement = useMemo(
    () => activeScene?.elements.find((e) => e.id === selectedId) || null,
    [activeScene, selectedId]
  );

  const commitDraft = useCallback((updater: (prev: StudioProject) => StudioProject) => {
    setHistory((h) => pushHistory(h, updater(h.present)));
    setIsDirty(true);
  }, []);

  const replaceDraftSilent = useCallback((updater: (prev: StudioProject) => StudioProject) => {
    setHistory((h) => ({ ...h, present: updater(h.present) }));
    setIsDirty(true);
  }, []);

  const updateActiveScene = useCallback(
    (updater: (scene: Scene) => Scene, silent = false) => {
      const fn = (prev: StudioProject): StudioProject => ({
        ...prev,
        scenes: prev.scenes.map((s) => (s.id === activeScene.id ? updater(s) : s)),
      });
      if (silent) replaceDraftSilent(fn);
      else commitDraft(fn);
    },
    [activeScene.id, commitDraft, replaceDraftSilent]
  );

  const updateElement = useCallback(
    (id: string, patch: Partial<CanvasElement>, silent = false) => {
      updateActiveScene(
        (scene) => ({
          ...scene,
          elements: scene.elements.map((el) => (el.id === id ? { ...el, ...patch } : el)),
        }),
        silent
      );
    },
    [updateActiveScene]
  );

  const updateElementProps = useCallback(
    (id: string, propsPatch: Partial<CanvasElement['props']>) => {
      updateActiveScene((scene) => ({
        ...scene,
        elements: scene.elements.map((el) =>
          el.id === id ? { ...el, props: { ...el.props, ...propsPatch } } : el
        ),
      }));
    },
    [updateActiveScene]
  );

  // =========================================================================
  // CANVA POINTER ENGINE: DRAG + SMART SNAP + 8-HANDLE RESIZE + ROTATE
  // =========================================================================
  const interactionRef = useRef<{
    mode: 'drag' | 'resize' | 'rotate';
    elId: string;
    startPointerX: number;
    startPointerY: number;
    startBox: { x: number; y: number; width: number; height: number; rotation: number };
    handle?: ResizeHandle;
    centerClientX?: number;
    centerClientY?: number;
    snapshotBefore: StudioProject;
    moved: boolean;
  } | null>(null);

  const stageWrapRef = useRef<HTMLDivElement | null>(null);

  const handleStartDrag = useCallback(
    (e: React.PointerEvent, el: CanvasElement) => {
      if (el.locked) return;
      interactionRef.current = {
        mode: 'drag',
        elId: el.id,
        startPointerX: e.clientX,
        startPointerY: e.clientY,
        startBox: { x: el.x, y: el.y, width: el.width, height: el.height, rotation: el.rotation },
        snapshotBefore: draft,
        moved: false,
      };
    },
    [draft]
  );

  const handleStartResize = useCallback(
    (e: React.PointerEvent, el: CanvasElement, handle: ResizeHandle) => {
      if (el.locked) return;
      interactionRef.current = {
        mode: 'resize',
        elId: el.id,
        startPointerX: e.clientX,
        startPointerY: e.clientY,
        startBox: { x: el.x, y: el.y, width: el.width, height: el.height, rotation: el.rotation },
        handle,
        snapshotBefore: draft,
        moved: false,
      };
    },
    [draft]
  );

  const handleStartRotate = useCallback(
    (e: React.PointerEvent, el: CanvasElement) => {
      if (el.locked || !stageWrapRef.current) return;
      const rect = stageWrapRef.current.getBoundingClientRect();
      const centerClientX = rect.left + (el.x + el.width / 2) * zoom;
      const centerClientY = rect.top + (el.y + el.height / 2) * zoom;
      interactionRef.current = {
        mode: 'rotate',
        elId: el.id,
        startPointerX: e.clientX,
        startPointerY: e.clientY,
        startBox: { x: el.x, y: el.y, width: el.width, height: el.height, rotation: el.rotation },
        centerClientX,
        centerClientY,
        snapshotBefore: draft,
        moved: false,
      };
    },
    [draft, zoom]
  );

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const act = interactionRef.current;
      if (!act) return;

      const dx = (e.clientX - act.startPointerX) / zoom;
      const dy = (e.clientY - act.startPointerY) / zoom;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) act.moved = true;

      if (act.mode === 'drag') {
        let nextX = Math.round(act.startBox.x + dx);
        let nextY = Math.round(act.startBox.y + dy);

        if (snapEnabled && !e.altKey) {
          const siblings = activeScene.elements
            .filter((s) => s.id !== act.elId && s.visible)
            .map((s) => ({ x: s.x, y: s.y, width: s.width, height: s.height }));
          const snapped = computeSmartSnap(
            { x: nextX, y: nextY, width: act.startBox.width, height: act.startBox.height },
            siblings,
            STAGE_W,
            STAGE_H,
            5
          );
          nextX = snapped.x;
          nextY = snapped.y;
          setSnapGuides(snapped.guides);
        } else {
          setSnapGuides([]);
        }
        updateElement(act.elId, { x: nextX, y: nextY }, true);
      } else if (act.mode === 'resize' && act.handle) {
        const resized = computeResizedBox(
          act.startBox,
          act.handle,
          dx,
          dy,
          36,
          24,
          e.shiftKey
        );
        updateElement(act.elId, resized, true);
      } else if (act.mode === 'rotate' && act.centerClientX !== undefined && act.centerClientY !== undefined) {
        const angleRad = Math.atan2(
          e.clientY - act.centerClientY,
          e.clientX - act.centerClientX
        );
        let deg = Math.round((angleRad * 180) / Math.PI - 90);
        if (e.shiftKey) deg = Math.round(deg / 15) * 15;
        if (Math.abs(deg) <= 3) deg = 0;
        updateElement(act.elId, { rotation: deg }, true);
      }
    };

    const onPointerUp = () => {
      const act = interactionRef.current;
      if (!act) return;
      interactionRef.current = null;
      setSnapGuides([]);
      if (act.moved) {
        setHistory((h) => ({
          past: [...h.past.slice(-29), act.snapshotBefore],
          present: h.present,
          future: [],
        }));
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [activeScene.elements, snapEnabled, updateElement, zoom]);

  // Keyboard shortcuts (Undo, Redo, Delete, Duplicate, Arrow nudge)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) setHistory((h) => redoHistory(h));
        else setHistory((h) => undoHistory(h));
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveSnapshot();
        return;
      }
      if (!selectedElement) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateElement(selectedElement);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteElement(selectedElement.id);
        return;
      }
      if (selectedElement.locked) return;
      const step = e.shiftKey ? 8 : 2;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        updateElement(selectedElement.id, { x: selectedElement.x - step });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        updateElement(selectedElement.id, { x: selectedElement.x + step });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        updateElement(selectedElement.id, { y: selectedElement.y - step });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        updateElement(selectedElement.id, { y: selectedElement.y + step });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // =========================================================================
  // ELEMENT & ASSET ACTIONS
  // =========================================================================
  const addElement = (kind: ElementKind, layer: DepthLayer = 'foreground', extra?: { src?: string; name?: string; width?: number; height?: number }) => {
    const maxZ = activeScene.elements.reduce((acc, el) => Math.max(acc, el.zIndex), 10);
    const created = createElementTemplate(kind, layer, maxZ + 1, extra);
    updateActiveScene((scene) => ({
      ...scene,
      elements: [...scene.elements, created],
    }));
    setSelectedId(created.id);
    onNotify(`Đã thêm "${created.name}" vào lớp ${layer === 'background' ? 'Nền' : layer === 'midground' ? 'Trung cảnh' : 'Tiền cảnh'}`, 'indigo');
  };

  const duplicateElement = (el: CanvasElement) => {
    const maxZ = activeScene.elements.reduce((acc, item) => Math.max(acc, item.zIndex), 10);
    const clone: CanvasElement = {
      ...el,
      id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: `${el.name} (Bản sao)`,
      x: Math.min(STAGE_W - 40, el.x + 14),
      y: Math.min(STAGE_H - 40, el.y + 14),
      zIndex: maxZ + 1,
      locked: false,
      props: { ...el.props },
    };
    updateActiveScene((scene) => ({
      ...scene,
      elements: [...scene.elements, clone],
    }));
    setSelectedId(clone.id);
  };

  const deleteElement = (id: string) => {
    updateActiveScene((scene) => ({
      ...scene,
      elements: scene.elements.filter((el) => el.id !== id),
    }));
    if (selectedId === id) setSelectedId(null);
  };

  const bumpZIndex = (el: CanvasElement, dir: 1 | -1) => {
    updateElement(el.id, { zIndex: Math.max(1, el.zIndex + dir * 2) });
  };

  const handleUploadAsset = async (
    e: React.ChangeEvent<HTMLInputElement>,
    targetLayer: DepthLayer
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const maxDim = targetLayer === 'background' ? 1080 : 680;
      const compressed = await compressUploadedImage(file, maxDim);
      const asset: UploadedAsset = {
        id: `ast-${Date.now()}`,
        name: file.name.replace(/\.[^.]+$/, '').slice(0, 28),
        dataUrl: compressed.dataUrl,
        suggestedLayer: targetLayer,
        width: compressed.width,
        height: compressed.height,
      };
      const aspect = compressed.width / Math.max(1, compressed.height);
      const targetW = targetLayer === 'background' ? STAGE_W : Math.min(240, Math.max(96, Math.round(160 * aspect)));
      const targetH = targetLayer === 'background' ? STAGE_H : Math.min(280, Math.max(70, Math.round(targetW / aspect)));

      const maxZ = activeScene.elements.reduce((acc, el) => Math.max(acc, el.zIndex), 10);
      const created = createElementTemplate('image', targetLayer, maxZ + 1, {
        src: asset.dataUrl,
        name: asset.name,
        width: targetW,
        height: targetH,
      });

      commitDraft((prev) => ({
        ...prev,
        assets: [asset, ...prev.assets],
        scenes: prev.scenes.map((s) =>
          s.id === activeScene.id
            ? { ...s, elements: [...s.elements, created] }
            : s
        ),
      }));
      setSelectedId(created.id);
      onNotify(`Đã tải ảnh vào lớp ${targetLayer === 'background' ? 'Nền' : targetLayer === 'midground' ? 'Trung cảnh' : 'Tiền cảnh'}!`, 'emerald');
    } catch {
      onNotify('Không thể xử lý file ảnh. Hãy chọn PNG, JPG hoặc WebP.', 'rose');
    }
  };

  const handleSaveSnapshot = async () => {
    setSaving(true);
    try {
      await onPublishProject(draft);
      lastSavedStampRef.current = new Date().toISOString();
      setIsDirty(false);
      onNotify('Đã lưu & đóng gói kịch bản! Đồng bộ tức thì tới Điều khiển Live và Output.', 'emerald');
    } finally {
      setSaving(false);
    }
  };

  // Scene CRUD
  const handleAddScene = () => {
    const newScene: Scene = {
      ...activeScene,
      id: `scene-${Date.now()}`,
      name: `Scene Mới ${draft.scenes.length + 1}`,
      tag: 'Tự thiết kế',
      elements: activeScene.elements.map((e) => ({
        ...e,
        id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        props: { ...e.props },
      })),
    };
    commitDraft((prev) => ({
      ...prev,
      activeSceneId: newScene.id,
      scenes: [...prev.scenes, newScene],
    }));
    setSelectedId(null);
    onNotify(`Đã nhân bản thành "${newScene.name}"`, 'emerald');
  };

  const handleDeleteScene = (sceneId: string) => {
    if (draft.scenes.length <= 1) {
      onNotify('Cần giữ lại ít nhất 1 Scene trong kịch bản.', 'amber');
      return;
    }
    commitDraft((prev) => {
      const remaining = prev.scenes.filter((s) => s.id !== sceneId);
      return {
        ...prev,
        activeSceneId: prev.activeSceneId === sceneId ? remaining[0].id : prev.activeSceneId,
        scenes: remaining,
      };
    });
    setSelectedId(null);
  };

  // Product CRUD
  const handleProductImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const res = await compressUploadedImage(file, 360);
      setPImg(res.dataUrl);
    } catch {
      onNotify('Ảnh sản phẩm không hợp lệ', 'rose');
    }
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const code = pCode.trim();
    const name = pName.trim();
    const liveVal = Number(pLive) || 0;
    const origVal = Number(pOrig) || 0;
    if (!code || !name || liveVal <= 0) {
      onNotify('Nhập đủ Mã SP, Tên sản phẩm và Giá Live hợp lệ!', 'amber');
      return;
    }
    const tags = pTags
      .split(/[•·,]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 2);

    if (editingProdId) {
      commitDraft((prev) => ({
        ...prev,
        products: prev.products.map((item) =>
          item.id === editingProdId
            ? { ...item, code, name, tags, originalPrice: origVal, livePrice: liveVal, customImage: pImg }
            : item
        ),
      }));
      onNotify(`Đã cập nhật ${code}`, 'emerald');
    } else {
      const types: Product['svgType'][] = ['serum-amber', 'sunscreen', 'cleanser-duo', 'mist'];
      const nextProd: Product = {
        id: `p-${Date.now()}`,
        code,
        name,
        tags,
        originalPrice: origVal,
        livePrice: liveVal,
        svgType: types[draft.products.length % types.length],
        customImage: pImg,
      };
      commitDraft((prev) => ({
        ...prev,
        products: [...prev.products, nextProd],
      }));
      onNotify(`Đã thêm ${code} vào danh mục`, 'emerald');
    }
    setEditingProdId(null);
    setPCode('');
    setPName('');
    setPTags('');
    setPOrig('');
    setPLive('');
    setPImg('');
  };

  const startEditProduct = (prod: Product) => {
    setEditingProdId(prod.id);
    setPCode(prod.code);
    setPName(prod.name);
    setPTags(prod.tags.join(' · '));
    setPOrig(String(prod.originalPrice || ''));
    setPLive(String(prod.livePrice || ''));
    setPImg(prod.customImage || '');
  };

  const deleteProduct = (prodId: string) => {
    commitDraft((prev) => ({
      ...prev,
      products: prev.products.filter((p) => p.id !== prodId),
    }));
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden bg-[#0b0e14]">
      {/* =====================================================================
          LEFT DOCK: CANVA TOOLKIT (ELEMENTS / 3-LAYER UPLOADS / SCENES / PRODUCTS)
          ===================================================================== */}
      <aside className="w-full lg:w-[290px] xl:w-[310px] bg-[#11151e] border-b lg:border-b-0 lg:border-r border-white/10 flex flex-col shrink-0 max-h-[38vh] lg:max-h-none">
        {/* Left Tab Selector */}
        <div className="grid grid-cols-4 gap-1 p-2 border-b border-white/10 bg-[#0d1017] shrink-0">
          <button
            type="button"
            onClick={() => setLeftTab('elements')}
            className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
              leftTab === 'elements'
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            <span>Thẻ mẫu</span>
          </button>
          <button
            type="button"
            onClick={() => setLeftTab('uploads')}
            className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
              leftTab === 'uploads'
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Tải 3 lớp</span>
          </button>
          <button
            type="button"
            onClick={() => setLeftTab('scenes')}
            className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
              leftTab === 'scenes'
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Scene</span>
          </button>
          <button
            type="button"
            onClick={() => setLeftTab('products')}
            className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
              leftTab === 'products'
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Sản phẩm</span>
          </button>
        </div>

        {/* Left Tab Body */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {leftTab === 'elements' && (
            <>
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-zinc-200">
                  Thêm khung & thẻ kéo thả (chuẩn Canva)
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Bấm để thả vào khung 9:16. Mọi thẻ sản phẩm, voucher, tiêu đề đều tự do kéo thả, co giãn và xoay.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {ELEMENT_PALETTE.map((item) => (
                  <button
                    key={item.kind}
                    type="button"
                    onClick={() => addElement(item.kind, 'foreground')}
                    className="w-full text-left px-3 py-2.5 rounded-xl bg-[#161c28] hover:bg-[#1e2636] border border-white/10 transition flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">{item.label}</div>
                      <div className="text-[11px] text-zinc-400 truncate">{item.desc}</div>
                    </div>
                    <Plus className="w-4 h-4 text-indigo-400 shrink-0" />
                  </button>
                ))}
              </div>
            </>
          )}

          {leftTab === 'uploads' && (
            <>
              <div className="space-y-1">
                <div className="text-xs font-semibold text-zinc-200">
                  Tải file theo 3 lớp chiều sâu
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Hỗ trợ PNG tách nền, WebP, JPG. Ảnh tự nén gọn nhẹ để chạy mượt không giật lag.
                </p>
              </div>

              <div className="space-y-2">
                {LAYER_META.map((layerInfo) => (
                  <label
                    key={layerInfo.id}
                    className="block p-2.5 rounded-xl bg-[#161c28] hover:bg-[#1e2636] border border-white/10 transition cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white">{layerInfo.label}</div>
                        <div className="text-[10.5px] text-zinc-400 truncate">{layerInfo.hint}</div>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-semibold shrink-0 whitespace-nowrap">
                        + Tải file
                      </span>
                    </div>
                    <input
                      type="file"
                      accept="image/png,image/webp,image/jpeg,image/svg+xml"
                      onChange={(e) => handleUploadAsset(e, layerInfo.id)}
                      className="hidden"
                    />
                  </label>
                ))}
              </div>

              {/* Layer target selector for dropping saved assets */}
              <div className="pt-2 border-t border-white/10 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-zinc-200">
                    Kho tài nguyên đã lưu ({draft.assets.length})
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 bg-[#0d1017] p-1 rounded-lg border border-white/10">
                  {(['background', 'midground', 'foreground'] as DepthLayer[]).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setUploadLayerTarget(l)}
                      className={`py-1 rounded-md text-[10.5px] font-semibold transition cursor-pointer ${
                        uploadLayerTarget === l
                          ? 'bg-indigo-600 text-white'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {l === 'background' ? 'Lớp Nền' : l === 'midground' ? 'Trung cảnh' : 'Tiền cảnh'}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {draft.assets.map((ast) => (
                    <button
                      key={ast.id}
                      type="button"
                      onClick={() =>
                        addElement('image', uploadLayerTarget, {
                          src: ast.dataUrl,
                          name: ast.name,
                          width: uploadLayerTarget === 'background' ? STAGE_W : 160,
                          height: uploadLayerTarget === 'background' ? STAGE_H : 160,
                        })
                      }
                      className="group relative rounded-xl overflow-hidden bg-[#161c28] border border-white/10 hover:border-indigo-400 transition text-left cursor-pointer"
                    >
                      <div className="aspect-[9/12] bg-zinc-950 overflow-hidden flex items-center justify-center">
                        <img
                          src={ast.dataUrl}
                          alt={ast.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                      </div>
                      <div className="p-1.5">
                        <div className="text-[10.5px] font-semibold text-zinc-200 truncate">
                          {ast.name}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {leftTab === 'scenes' && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-200">
                  Danh sách Scene ({draft.scenes.length})
                </span>
                <button
                  type="button"
                  onClick={handleAddScene}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                >
                  + Nhân bản Scene
                </button>
              </div>

              <div className="space-y-1.5">
                {draft.scenes.map((sc) => {
                  const active = sc.id === activeScene.id;
                  return (
                    <div
                      key={sc.id}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition ${
                        active
                          ? 'bg-indigo-600/20 border-indigo-400/70'
                          : 'bg-[#161c28] border-white/10 hover:border-white/20'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          commitDraft((prev) => ({ ...prev, activeSceneId: sc.id }));
                          setSelectedId(null);
                        }}
                        className="flex-1 text-left min-w-0 cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full shrink-0 border border-white/40"
                            style={{ backgroundColor: sc.accentColor }}
                          />
                          <span className="text-xs font-bold text-white truncate">{sc.name}</span>
                        </div>
                        <div className="text-[10.5px] text-zinc-400 mt-0.5 truncate">
                          {sc.elements.length} thành phần · {sc.glassFinish === 'dark' ? 'Kính khói' : 'Kính sáng'}
                        </div>
                      </button>
                      {draft.scenes.length > 1 && (
                        <button
                          type="button"
                          aria-label={`Xóa scene ${sc.name}`}
                          onClick={() => handleDeleteScene(sc.id)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Scene Global Style */}
              <div className="pt-3 border-t border-white/10 space-y-3">
                <div className="text-xs font-semibold text-zinc-200">Cài đặt Scene hiện tại</div>

                <div>
                  <label htmlFor="scene-name-input" className="block text-[11px] text-zinc-400 mb-1">
                    Tên Scene
                  </label>
                  <input
                    id="scene-name-input"
                    type="text"
                    value={activeScene.name}
                    onChange={(e) =>
                      updateActiveScene((s) => ({ ...s, name: e.target.value }))
                    }
                    className="w-full bg-[#0d1017] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-400"
                  />
                </div>

                <div>
                  <div className="text-[11px] text-zinc-400 mb-1">Chất liệu kính</div>
                  <div className="grid grid-cols-2 gap-1 bg-[#0d1017] p-1 rounded-lg border border-white/10">
                    <button
                      type="button"
                      onClick={() => updateActiveScene((s) => ({ ...s, glassFinish: 'light', glassOpacity: 68 }))}
                      className={`py-1.5 rounded-md text-[11px] font-semibold cursor-pointer ${
                        activeScene.glassFinish === 'light' ? 'bg-white text-zinc-900' : 'text-zinc-400'
                      }`}
                    >
                      Kính sáng
                    </button>
                    <button
                      type="button"
                      onClick={() => updateActiveScene((s) => ({ ...s, glassFinish: 'dark', glassOpacity: 54 }))}
                      className={`py-1.5 rounded-md text-[11px] font-semibold cursor-pointer ${
                        activeScene.glassFinish === 'dark' ? 'bg-zinc-700 text-white' : 'text-zinc-400'
                      }`}
                    >
                      Kính khói
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex justify-between text-[10.5px] text-zinc-400 mb-1">
                      <span>Độ mờ</span>
                      <span className="font-mono-num text-indigo-300">{activeScene.glassBlur}px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={28}
                      value={activeScene.glassBlur}
                      onChange={(e) =>
                        updateActiveScene((s) => ({ ...s, glassBlur: Number(e.target.value) }), true)
                      }
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10.5px] text-zinc-400 mb-1">
                      <span>Độ đục</span>
                      <span className="font-mono-num text-indigo-300">{activeScene.glassOpacity}%</span>
                    </div>
                    <input
                      type="range"
                      min={30}
                      max={92}
                      value={activeScene.glassOpacity}
                      onChange={(e) =>
                        updateActiveScene((s) => ({ ...s, glassOpacity: Number(e.target.value) }), true)
                      }
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-zinc-400 mb-1.5">Màu chủ đạo</div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {ACCENT_SWATCHES.map((sw) => (
                      <button
                        key={sw.hex}
                        type="button"
                        aria-label={`Chọn màu ${sw.label}`}
                        onClick={() =>
                          updateActiveScene((s) => ({
                            ...s,
                            accentColor: sw.hex,
                            accentColor2: sw.hex2,
                          }))
                        }
                        className={`w-6 h-6 rounded-full cursor-pointer transition ${
                          activeScene.accentColor.toLowerCase() === sw.hex.toLowerCase()
                            ? 'ring-2 ring-white ring-offset-2 ring-offset-[#11151e]'
                            : 'opacity-85 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: sw.hex }}
                      />
                    ))}
                    <label className="w-6 h-6 rounded-full border border-white/25 overflow-hidden cursor-pointer flex items-center justify-center">
                      <input
                        type="color"
                        aria-label="Chọn màu tự do"
                        value={activeScene.accentColor}
                        onChange={(e) =>
                          updateActiveScene((s) => ({
                            ...s,
                            accentColor: e.target.value,
                            accentColor2: lightenHex(e.target.value, 34),
                          }))
                        }
                        className="w-8 h-8 cursor-pointer border-0"
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-zinc-400 mb-1">Nền mặc định (chưa có ảnh nền)</div>
                  <div className="grid grid-cols-2 gap-1">
                    {(
                      [
                        { id: 'white-studio', label: 'Phòng Trắng' },
                        { id: 'soft-gray', label: 'Xám Studio' },
                        { id: 'chroma-green', label: 'Phông Xanh' },
                        { id: 'transparent', label: 'Trong Suốt OBS' },
                      ] as Array<{ id: BackdropMode; label: string }>
                    ).map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => updateActiveScene((s) => ({ ...s, backdrop: b.id }))}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                          activeScene.backdrop === b.id
                            ? 'bg-indigo-600/25 border-indigo-400 text-white'
                            : 'bg-[#0d1017] border-white/10 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-zinc-400 mb-1">Hiệu ứng hạt rơi</div>
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        { id: 'none', label: 'Tắt (Nhẹ)' },
                        { id: 'snow', label: 'Tuyết' },
                        { id: 'petals', label: 'Hoa rơi' },
                        { id: 'bokeh', label: 'Bokeh' },
                        { id: 'sparkle', label: 'Lấp lánh' },
                      ] as Array<{ id: AmbientFxType; label: string }>
                    ).map((fx) => (
                      <button
                        key={fx.id}
                        type="button"
                        onClick={() => updateActiveScene((s) => ({ ...s, ambientType: fx.id }))}
                        className={`py-1.5 px-2 rounded-lg text-[10.5px] font-semibold border cursor-pointer ${
                          activeScene.ambientType === fx.id
                            ? 'bg-indigo-600/25 border-indigo-400 text-white'
                            : 'bg-[#0d1017] border-white/10 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {fx.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {leftTab === 'products' && (
            <>
              <form onSubmit={handleSaveProduct} className="space-y-2 pb-3 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-200">
                    {editingProdId ? 'Đang sửa sản phẩm' : 'Thêm sản phẩm Live'}
                  </span>
                  {editingProdId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProdId(null);
                        setPCode('');
                        setPName('');
                        setPTags('');
                        setPOrig('');
                        setPLive('');
                        setPImg('');
                      }}
                      className="text-[11px] text-rose-400 hover:underline cursor-pointer"
                    >
                      Hủy sửa
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <input
                    type="text"
                    value={pCode}
                    onChange={(e) => setPCode(e.target.value)}
                    placeholder="MÃ 05"
                    className="bg-[#0d1017] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
                  />
                  <input
                    type="text"
                    value={pName}
                    onChange={(e) => setPName(e.target.value)}
                    placeholder="Tên sản phẩm..."
                    className="col-span-2 bg-[#0d1017] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
                  />
                </div>
                <input
                  type="text"
                  value={pTags}
                  onChange={(e) => setPTags(e.target.value)}
                  placeholder="Ưu điểm ngắn (vd: Freeship, Tặng quà)"
                  className="w-full bg-[#0d1017] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
                />
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={pOrig}
                    onChange={(e) => setPOrig(e.target.value)}
                    placeholder="Giá gốc (VNĐ)"
                    className="bg-[#0d1017] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
                  />
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={pLive}
                    onChange={(e) => setPLive(e.target.value)}
                    placeholder="Giá Live *"
                    className="bg-[#0d1017] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-[#0d1017] border border-white/10 flex items-center justify-center overflow-hidden text-[10px] text-zinc-500 shrink-0">
                    {pImg ? <img src={pImg} alt="Preview" className="w-full h-full object-contain" /> : 'PNG'}
                  </div>
                  <label className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#1b2230] hover:bg-[#252e40] border border-white/10 text-[11px] font-semibold text-zinc-200 text-center cursor-pointer">
                    Chọn ảnh SP tách nền
                    <input type="file" accept="image/*" onChange={handleProductImageChange} className="hidden" />
                  </label>
                </div>
                <button
                  type="submit"
                  className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
                >
                  {editingProdId ? 'Cập nhật sản phẩm' : '+ Thêm sản phẩm'}
                </button>
              </form>

              <div className="space-y-1.5">
                {draft.products.map((prod) => (
                  <div
                    key={prod.id}
                    className="p-2 rounded-xl bg-[#161c28] border border-white/10 flex items-center gap-2"
                  >
                    <div className="w-9 h-9 rounded-lg bg-white/90 p-1 shrink-0 overflow-hidden">
                      <ProductVisual product={prod} transparent />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold text-indigo-300">{prod.code}</div>
                      <div className="text-xs font-semibold text-white truncate">{prod.name}</div>
                      <div className="text-[10.5px] text-zinc-400 font-mono-num">{formatVND(prod.livePrice)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => startEditProduct(prod)}
                      className="px-2 py-1 rounded bg-white/10 hover:bg-white/15 text-[10.5px] font-semibold text-zinc-200 cursor-pointer"
                    >
                      Sửa
                    </button>
                    <button
                      type="button"
                      aria-label={`Xóa sản phẩm ${prod.code}`}
                      onClick={() => deleteProduct(prod.id)}
                      className="p-1 rounded text-zinc-400 hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </aside>

      {/* =====================================================================
          CENTER WORKSPACE: CANVA 9:16 INTERACTIVE STAGE
          ===================================================================== */}
      <section className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#0d111a]">
        {/* Canvas Utility Bar — Single-row crisp layout */}
        <div className="px-2.5 py-1.5 border-b border-white/10 bg-[#11151e] flex items-center justify-between gap-2 shrink-0 overflow-x-auto">
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              aria-label="Hoàn tác"
              disabled={history.past.length === 0}
              onClick={() => setHistory((h) => undoHistory(h))}
              className="p-1.5 rounded-lg bg-[#181f2c] hover:bg-[#222b3c] disabled:opacity-35 text-zinc-200 border border-white/10 cursor-pointer"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label="Làm lại"
              disabled={history.future.length === 0}
              onClick={() => setHistory((h) => redoHistory(h))}
              className="p-1.5 rounded-lg bg-[#181f2c] hover:bg-[#222b3c] disabled:opacity-35 text-zinc-200 border border-white/10 cursor-pointer"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>

            <div className="h-4 w-px bg-white/10 mx-0.5" />

            <button
              type="button"
              onClick={() => setSnapEnabled((s) => !s)}
              className={`px-2 py-1 rounded-lg text-[11px] font-semibold border flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                snapEnabled
                  ? 'bg-indigo-600/20 border-indigo-400/60 text-indigo-200'
                  : 'bg-[#181f2c] border-white/10 text-zinc-400'
              }`}
            >
              <Magnet className="w-3.5 h-3.5" />
              <span>Hít lề</span>
            </button>

            <button
              type="button"
              onClick={onToggleSafeZone}
              className={`px-2 py-1 rounded-lg text-[11px] font-semibold border flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                live.showSafeZone
                  ? 'bg-sky-600/25 border-sky-400/60 text-sky-200'
                  : 'bg-[#181f2c] border-white/10 text-zinc-300'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Safe TikTok</span>
            </button>

            <button
              type="button"
              onClick={onToggleCamera}
              className={`px-2 py-1 rounded-lg text-[11px] font-semibold border flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                cameraStream
                  ? 'bg-emerald-600/25 border-emerald-400/60 text-emerald-200'
                  : 'bg-[#181f2c] border-white/10 text-zinc-300'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{cameraStream ? 'Tắt Cam' : 'Camera'}</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <div className="flex items-center bg-[#0d1017] rounded-lg border border-white/10 p-0.5 text-[10.5px]">
              {[0.8, 0.95, 1.05].map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => setZoom(z)}
                  className={`px-1.5 py-0.5 rounded font-mono-num font-semibold cursor-pointer ${
                    zoom === z ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {Math.round(z * 100)}%
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleSaveSnapshot}
              disabled={saving}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition ${
                isDirty
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/25'
                  : 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-200 border border-emerald-500/40'
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Đang lưu...' : isDirty ? 'Lưu & Đóng gói Live' : 'Đã lưu'}</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                if (isDirty) await handleSaveSnapshot();
                onSwitchToLive();
              }}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white text-zinc-950 hover:bg-zinc-200 cursor-pointer whitespace-nowrap"
            >
              Điều Khiển Live →
            </button>
          </div>
        </div>

        {/* Canvas Viewport */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-6 relative">
          <div
            ref={stageWrapRef}
            className="relative shadow-[0_24px_70px_rgba(0,0,0,0.7)] rounded-[26px] border-2 border-white/15 overflow-visible transition-transform duration-150"
            style={{
              width: `${STAGE_W}px`,
              height: `${STAGE_H}px`,
              transform: `scale(${zoom})`,
              transformOrigin: 'center center',
            }}
          >
            <div className="w-full h-full rounded-[24px] overflow-hidden">
              <StageRenderer
                scene={activeScene}
                products={draft.products}
                live={live}
                pinnedComment={pinnedComment}
                cameraStream={cameraStream}
                cameraMirrored={cameraMirrored}
                editable
                selectedId={selectedId}
                snapGuides={snapGuides}
                onSelectElement={setSelectedId}
                onStartDrag={handleStartDrag}
                onStartResize={handleStartResize}
                onStartRotate={handleStartRotate}
              />
            </div>

            {/* Floating Canva Quick Bar when an element is selected */}
            {selectedElement && (
              <div
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute -top-11 left-1/2 -translate-x-1/2 bg-[#161c28] border border-white/15 rounded-xl px-2 py-1 shadow-2xl flex items-center gap-1 z-[60] whitespace-nowrap"
              >
                <button
                  type="button"
                  title="Căn giữa ngang"
                  aria-label="Căn giữa ngang"
                  onClick={() =>
                    updateElement(selectedElement.id, {
                      x: Math.round((STAGE_W - selectedElement.width) / 2),
                    })
                  }
                  className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-200 cursor-pointer"
                >
                  <AlignCenterHorizontal className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title="Căn giữa dọc"
                  aria-label="Căn giữa dọc"
                  onClick={() =>
                    updateElement(selectedElement.id, {
                      y: Math.round((STAGE_H - selectedElement.height) / 2),
                    })
                  }
                  className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-200 cursor-pointer"
                >
                  <AlignCenterVertical className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title="Nhân bản (Ctrl+D)"
                  aria-label="Nhân bản element"
                  onClick={() => duplicateElement(selectedElement)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-200 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title={selectedElement.locked ? 'Mở khóa' : 'Khóa vị trí'}
                  aria-label={selectedElement.locked ? 'Mở khóa element' : 'Khóa vị trí element'}
                  onClick={() =>
                    updateElement(selectedElement.id, { locked: !selectedElement.locked })
                  }
                  className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-200 cursor-pointer"
                >
                  {selectedElement.locked ? (
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <Unlock className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  title="Xóa (Delete)"
                  aria-label="Xóa element"
                  onClick={() => deleteElement(selectedElement.id)}
                  className="p-1.5 rounded-lg hover:bg-rose-500/20 text-rose-400 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* =====================================================================
          RIGHT PANEL: 3-DEPTH LAYER TREE & ELEMENT PROPERTY INSPECTOR
          ===================================================================== */}
      <aside className="w-full lg:w-[300px] xl:w-[320px] bg-[#11151e] border-t lg:border-t-0 lg:border-l border-white/10 flex flex-col shrink-0 max-h-[38vh] lg:max-h-none overflow-hidden">
        {/* Selected Element Inspector */}
        <div className="p-3 border-b border-white/10 overflow-y-auto max-h-[52%] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5 text-indigo-400" />
              Thuộc tính Element
            </span>
            {selectedElement && (
              <span className="text-[11px] text-zinc-400 truncate max-w-[135px]">
                {selectedElement.name}
              </span>
            )}
          </div>

          {!selectedElement ? (
            <div className="py-4 text-center text-xs text-zinc-400 bg-[#0d1017] rounded-xl border border-white/5 px-3">
              Bấm chọn một thành phần trên khung 9:16 hoặc ở danh sách lớp bên dưới để chỉnh vị trí, kích thước, nội dung và lớp chiều sâu.
            </div>
          ) : (
            <div className="space-y-2.5">
              {/* Layer depth switcher */}
              <div>
                <div className="text-[11px] text-zinc-400 mb-1">Chiều sâu lớp hiển thị</div>
                <div className="grid grid-cols-3 gap-1 bg-[#0d1017] p-1 rounded-lg border border-white/10">
                  {(['background', 'midground', 'foreground'] as DepthLayer[]).map((layerId) => (
                    <button
                      key={layerId}
                      type="button"
                      onClick={() => updateElement(selectedElement.id, { layer: layerId })}
                      className={`py-1 rounded text-[10.5px] font-semibold cursor-pointer ${
                        selectedElement.layer === layerId
                          ? 'bg-indigo-600 text-white'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {layerId === 'background' ? 'Nền' : layerId === 'midground' ? 'Trung cảnh' : 'Tiền cảnh'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Geometry: X, Y, W, H, Rotation, Opacity */}
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: 'X', val: selectedElement.x, key: 'x' as const },
                  { label: 'Y', val: selectedElement.y, key: 'y' as const },
                  { label: 'W', val: selectedElement.width, key: 'width' as const },
                  { label: 'H', val: selectedElement.height, key: 'height' as const },
                ].map((f) => (
                  <label key={f.key} className="bg-[#0d1017] border border-white/10 rounded-lg px-2 py-1">
                    <span className="block text-[9.5px] text-zinc-500">{f.label}</span>
                    <input
                      type="number"
                      value={Math.round(f.val)}
                      onChange={(e) =>
                        updateElement(selectedElement.id, {
                          [f.key]: Math.max(f.key === 'width' || f.key === 'height' ? 24 : -400, Number(e.target.value) || 0),
                        })
                      }
                      className="w-full bg-transparent text-xs font-mono-num text-white focus:outline-none"
                    />
                  </label>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="flex justify-between text-[10.5px] text-zinc-400 mb-1">
                    <span>Xoay</span>
                    <span className="font-mono-num text-indigo-300">{selectedElement.rotation}°</span>
                  </div>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    value={selectedElement.rotation}
                    onChange={(e) =>
                      updateElement(selectedElement.id, { rotation: Number(e.target.value) }, true)
                    }
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10.5px] text-zinc-400 mb-1">
                    <span>Độ mờ đục</span>
                    <span className="font-mono-num text-indigo-300">
                      {Math.round(selectedElement.opacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={Math.round(selectedElement.opacity * 100)}
                    onChange={(e) =>
                      updateElement(selectedElement.id, { opacity: Number(e.target.value) / 100 }, true)
                    }
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>
              </div>

              {selectedElement.kind === 'image' && (
                <div className="space-y-2 pt-1 border-t border-white/10">
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        updateElement(selectedElement.id, { x: 0, y: 0, width: STAGE_W, height: STAGE_H })
                      }
                      className="flex-1 py-1.5 rounded-lg bg-[#1b2230] hover:bg-[#252e40] border border-white/10 text-[11px] font-semibold text-zinc-200 flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Maximize2 className="w-3 h-3" />
                      Phủ kín 9:16
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateElementProps(selectedElement.id, {
                          objectFit: selectedElement.props.objectFit === 'cover' ? 'contain' : 'cover',
                        })
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-[#1b2230] border border-white/10 text-[11px] font-semibold text-zinc-200 cursor-pointer"
                    >
                      {selectedElement.props.objectFit === 'cover' ? 'Cắt phủ (Cover)' : 'Giữ nguyên (Contain)'}
                    </button>
                  </div>
                </div>
              )}

              {selectedElement.kind === 'header' && (
                <div className="space-y-1.5 pt-1 border-t border-white/10">
                  <input
                    type="text"
                    aria-label="Tên shop"
                    value={selectedElement.props.shopName || ''}
                    onChange={(e) => updateElementProps(selectedElement.id, { shopName: e.target.value })}
                    placeholder="Tên thương hiệu..."
                    className="w-full bg-[#0d1017] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                  <input
                    type="text"
                    aria-label="Tiêu đề chiến dịch"
                    value={selectedElement.props.title || ''}
                    onChange={(e) => updateElementProps(selectedElement.id, { title: e.target.value })}
                    placeholder="Tiêu đề chính..."
                    className="w-full bg-[#0d1017] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                  <input
                    type="text"
                    aria-label="Phụ đề chiến dịch"
                    value={selectedElement.props.subtitle || ''}
                    onChange={(e) => updateElementProps(selectedElement.id, { subtitle: e.target.value })}
                    placeholder="Phụ đề ưu đãi..."
                    className="w-full bg-[#0d1017] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                  <div className="grid grid-cols-3 gap-1">
                    {(['editorial', 'mega-sale', 'minimal-pill'] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => updateElementProps(selectedElement.id, { headerVariant: v })}
                        className={`py-1 rounded text-[10px] font-semibold border cursor-pointer ${
                          (selectedElement.props.headerVariant || 'editorial') === v
                            ? 'bg-indigo-600/30 border-indigo-400 text-white'
                            : 'bg-[#0d1017] border-white/10 text-zinc-400'
                        }`}
                      >
                        {v === 'editorial' ? 'Editorial' : v === 'mega-sale' ? 'Siêu Sale' : 'Viên thuốc'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedElement.kind === 'voucher' && (
                <div className="space-y-1.5 pt-1 border-t border-white/10">
                  <input
                    type="text"
                    aria-label="Nhãn trên voucher"
                    value={selectedElement.props.topLabel || ''}
                    onChange={(e) => updateElementProps(selectedElement.id, { topLabel: e.target.value })}
                    placeholder="VOUCHER LIVE"
                    className="w-full bg-[#0d1017] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                  <input
                    type="text"
                    aria-label="Giá trị voucher"
                    value={selectedElement.props.mainValue || ''}
                    onChange={(e) => updateElementProps(selectedElement.id, { mainValue: e.target.value })}
                    placeholder="GIẢM 50%"
                    className="w-full bg-[#0d1017] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                  <input
                    type="text"
                    aria-label="Ghi chú voucher"
                    value={selectedElement.props.subLabel || ''}
                    onChange={(e) => updateElementProps(selectedElement.id, { subLabel: e.target.value })}
                    placeholder="Đơn từ 199K"
                    className="w-full bg-[#0d1017] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
              )}

              {selectedElement.kind === 'host-tag' && (
                <div className="space-y-1.5 pt-1 border-t border-white/10">
                  <input
                    type="text"
                    aria-label="Tên Host"
                    value={selectedElement.props.hostName || ''}
                    onChange={(e) => updateElementProps(selectedElement.id, { hostName: e.target.value })}
                    placeholder="HOST: MINH ANH"
                    className="w-full bg-[#0d1017] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                  <input
                    type="text"
                    aria-label="Mô tả Host"
                    value={selectedElement.props.hostSub || ''}
                    onChange={(e) => updateElementProps(selectedElement.id, { hostSub: e.target.value })}
                    placeholder="Tư vấn & Chốt đơn"
                    className="w-full bg-[#0d1017] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
              )}

              {selectedElement.kind === 'trust-bar' && (
                <div className="space-y-1.5 pt-1 border-t border-white/10">
                  <input
                    type="text"
                    aria-label="Quyền lợi 1"
                    value={selectedElement.props.trust1 || ''}
                    onChange={(e) => updateElementProps(selectedElement.id, { trust1: e.target.value })}
                    className="w-full bg-[#0d1017] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                  <input
                    type="text"
                    aria-label="Quyền lợi 2"
                    value={selectedElement.props.trust2 || ''}
                    onChange={(e) => updateElementProps(selectedElement.id, { trust2: e.target.value })}
                    className="w-full bg-[#0d1017] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                  <input
                    type="text"
                    aria-label="Quyền lợi 3"
                    value={selectedElement.props.trust3 || ''}
                    onChange={(e) => updateElementProps(selectedElement.id, { trust3: e.target.value })}
                    className="w-full bg-[#0d1017] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
              )}

              {selectedElement.kind === 'text' && (
                <div className="space-y-1.5 pt-1 border-t border-white/10">
                  <input
                    type="text"
                    aria-label="Nội dung chữ"
                    value={selectedElement.props.text || ''}
                    onChange={(e) => updateElementProps(selectedElement.id, { text: e.target.value })}
                    className="w-full bg-[#0d1017] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-zinc-400">Cỡ chữ</label>
                    <input
                      type="number"
                      min={9}
                      max={42}
                      value={selectedElement.props.fontSize || 15}
                      onChange={(e) => updateElementProps(selectedElement.id, { fontSize: Number(e.target.value) })}
                      className="w-16 bg-[#0d1017] border border-white/10 rounded px-2 py-1 text-xs font-mono-num text-white"
                    />
                    <input
                      type="color"
                      aria-label="Màu chữ"
                      value={selectedElement.props.color || '#ffffff'}
                      onChange={(e) => updateElementProps(selectedElement.id, { color: e.target.value })}
                      className="w-7 h-7 rounded border border-white/20 cursor-pointer"
                    />
                    <input
                      type="color"
                      aria-label="Màu nền khối chữ"
                      value={
                        selectedElement.props.backgroundColor?.startsWith('#')
                          ? selectedElement.props.backgroundColor
                          : '#5b4fe8'
                      }
                      onChange={(e) => updateElementProps(selectedElement.id, { backgroundColor: e.target.value })}
                      className="w-7 h-7 rounded border border-white/20 cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {(selectedElement.kind === 'product-spotlight' ||
                selectedElement.kind === 'product-pill') && (
                <div className="space-y-1.5 pt-1 border-t border-white/10">
                  <label htmlFor="linked-product-select" className="block text-[11px] text-zinc-400">
                    Liên kết dữ liệu sản phẩm
                  </label>
                  <select
                    id="linked-product-select"
                    value={selectedElement.props.linkedProductId || ''}
                    onChange={(e) =>
                      updateElementProps(selectedElement.id, { linkedProductId: e.target.value })
                    }
                    className="w-full bg-[#0d1017] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="">Tự động theo sản phẩm đang Live (Khuyên dùng)</option>
                    {draft.products.map((prod) => (
                      <option key={prod.id} value={prod.id}>
                        Cố định: {prod.code} — {prod.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3-Depth Layer Stack Tree */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              Cây Lớp Chiều Sâu
            </span>
            <span className="text-[11px] text-zinc-400 font-mono-num">
              {activeScene.elements.length} lớp
            </span>
          </div>

          {LAYER_META.map((group) => {
            const items = activeScene.elements
              .filter((e) => e.layer === group.id)
              .sort((a, b) => b.zIndex - a.zIndex);

            return (
              <React.Fragment key={group.id}>
                {group.id === 'midground' && (
                  <div className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-[10.5px] font-semibold text-emerald-300 flex items-center gap-1.5">
                    <Camera className="w-3 h-3 shrink-0" />
                    <span>Lớp Camera Host (Giữa Tiền & Trung cảnh)</span>
                  </div>
                )}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 px-1">
                    <span>{group.label}</span>
                    <span className="font-mono-num">{items.length}</span>
                  </div>

                {items.length === 0 ? (
                  <div className="text-[10.5px] text-zinc-500 px-2 py-1.5 rounded-lg bg-[#0d1017]/60 border border-dashed border-white/10">
                    Trống — thả ảnh hoặc element vào lớp này
                  </div>
                ) : (
                  items.map((el) => {
                    const isSel = selectedId === el.id;
                    return (
                      <div
                        key={el.id}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs transition ${
                          isSel
                            ? 'bg-indigo-600/20 border-indigo-400/70 text-white'
                            : 'bg-[#161c28] border-white/5 text-zinc-300 hover:border-white/15'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedId(el.id)}
                          className="flex-1 text-left truncate flex items-center gap-1.5 cursor-pointer min-w-0"
                        >
                          <ImageIcon className="w-3 h-3 text-zinc-400 shrink-0" />
                          <span className="truncate font-medium">{el.name}</span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Đưa ${el.name} lên trên`}
                          onClick={() => bumpZIndex(el, 1)}
                          className="p-1 text-zinc-400 hover:text-white cursor-pointer"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Đưa ${el.name} xuống dưới`}
                          onClick={() => bumpZIndex(el, -1)}
                          className="p-1 text-zinc-400 hover:text-white cursor-pointer"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          aria-label={el.visible ? `Ẩn ${el.name}` : `Hiện ${el.name}`}
                          onClick={() => updateElement(el.id, { visible: !el.visible })}
                          className="p-1 text-zinc-400 hover:text-white cursor-pointer"
                        >
                          {el.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-zinc-600" />}
                        </button>
                        <button
                          type="button"
                          aria-label={el.locked ? `Mở khóa ${el.name}` : `Khóa ${el.name}`}
                          onClick={() => updateElement(el.id, { locked: !el.locked })}
                          className="p-1 text-zinc-400 hover:text-white cursor-pointer"
                        >
                          {el.locked ? <Lock className="w-3 h-3 text-amber-400" /> : <Unlock className="w-3 h-3" />}
                        </button>
                      </div>
                    );
                  })
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </aside>
    </div>
  );
};
