export type DepthLayer = 'background' | 'midground' | 'foreground';

export type ElementKind =
  | 'image'
  | 'header'
  | 'voucher'
  | 'product-spotlight'
  | 'product-shelf'
  | 'product-pill'
  | 'host-tag'
  | 'flash-timer'
  | 'trust-bar'
  | 'text'
  | 'pinned-comment';

export type BackdropMode =
  | 'white-studio'
  | 'soft-gray'
  | 'chroma-green'
  | 'transparent'
  | 'custom-color';

export type GlassFinish = 'light' | 'dark';

export type AmbientFxType = 'none' | 'snow' | 'petals' | 'bokeh' | 'sparkle';

export interface CanvasElement {
  id: string;
  name: string;
  kind: ElementKind;
  layer: DepthLayer;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  zIndex: number;
  locked: boolean;
  visible: boolean;
  props: {
    // Image element
    src?: string;
    objectFit?: 'contain' | 'cover' | 'fill';
    borderRadius?: number;
    // Header element
    shopName?: string;
    title?: string;
    subtitle?: string;
    headerVariant?: 'editorial' | 'mega-sale' | 'minimal-pill';
    // Voucher element
    topLabel?: string;
    mainValue?: string;
    subLabel?: string;
    voucherVariant?: 'ticket' | 'pill' | 'solid';
    // Host / Follow tag
    hostName?: string;
    hostSub?: string;
    badgeAccent?: string;
    // Text element
    text?: string;
    fontSize?: number;
    fontWeight?: '600' | '700' | '800' | '900';
    textAlign?: 'left' | 'center' | 'right';
    color?: string;
    backgroundColor?: string;
    // Trust bar
    trust1?: string;
    trust2?: string;
    trust3?: string;
    // Product linking
    linkedProductId?: string; // optional override; empty = follows active Live product
    showDiscountBadge?: boolean;
  };
}

export interface Product {
  id: string;
  code: string;
  name: string;
  tags: string[];
  originalPrice: number;
  livePrice: number;
  svgType: 'serum-amber' | 'sunscreen' | 'cleanser-duo' | 'mist';
  customImage: string;
}

export interface UploadedAsset {
  id: string;
  name: string;
  dataUrl: string;
  suggestedLayer: DepthLayer;
  width: number;
  height: number;
  isBuiltinRef?: boolean;
}

export interface Scene {
  id: string;
  name: string;
  tag: string;
  glassFinish: GlassFinish;
  glassBlur: number;
  glassOpacity: number;
  accentColor: string;
  accentColor2: string;
  backdrop: BackdropMode;
  backdropColor: string;
  ambientType: AmbientFxType;
  ambientDensity: number;
  elements: CanvasElement[];
}

export interface StudioProject {
  id: string;
  name: string;
  updatedAt: string;
  activeSceneId: string;
  scenes: Scene[];
  products: Product[];
  assets: UploadedAsset[];
}

export type CommentPlatform = 'tiktok' | 'shopee' | 'facebook' | 'webhook' | 'studio';
export type CommentPriority = 'hot' | 'question' | 'normal';

export interface LiveComment {
  id: string;
  user: string;
  text: string;
  platform: CommentPlatform;
  timestamp: number;
  priority: CommentPriority;
  matchedKeywords: string[];
  answered: boolean;
  giftName?: string;
}

export type LiveAlertType = 'order' | 'gift' | 'hearts' | 'flash' | 'lixi' | 'fireworks';

export interface LiveAlert {
  id: string;
  type: LiveAlertType;
  title: string;
  subtitle: string;
  timestamp: number;
}

export interface LiveRuntimeState {
  activeSceneId: string;
  activeProductId: string | null;
  pricePulseAt: number;
  flashTotal: number;
  flashLeft: number;
  flashRunning: boolean;
  flashActive: boolean;
  performanceMode: boolean;
  showSafeZone: boolean;
  pinnedCommentId: string | null;
  showPinnedOnStage: boolean;
  activeAlert: LiveAlert | null;
}

export interface RoomPresence {
  total: number;
  admin: number;
  operator: number;
  output: number;
  teleprompter: number;
}

export type WorkspaceTab = 'editor' | 'live' | 'connect';
export type AppViewMode = 'studio' | 'output' | 'teleprompter';
