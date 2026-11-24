import type {
  CommentPlatform,
  CommentPriority,
  LiveAlert,
  LiveComment,
} from '../types/studio';

const HOT_BUY_KEYWORDS = [
  'chốt',
  'chot',
  'đặt',
  'dat don',
  'mua',
  'lấy',
  'lay ',
  'order',
  'lên đơn',
  'len don',
  'combo',
  'săn',
  'giỏ hàng',
];

const QUESTION_KEYWORDS = [
  'giá',
  'gia ',
  'bao nhiêu',
  'bn',
  'mã',
  'ma ',
  'size',
  'ship',
  'freeship',
  'tư vấn',
  'tu van',
  'da dầu',
  'da khô',
  'nhạy cảm',
  'mụn',
  'voucher',
  'quà',
  'link',
  '?',
];

export type AutoReadFilterMode = 'all' | 'priority' | 'hot-only';

export function classifyComment(text: string): {
  priority: CommentPriority;
  matchedKeywords: string[];
} {
  const normalized = (text || '').toLowerCase().trim();
  if (!normalized) {
    return { priority: 'normal', matchedKeywords: [] };
  }

  const matchedHot = HOT_BUY_KEYWORDS.filter((kw) => normalized.includes(kw));
  const matchedQ = QUESTION_KEYWORDS.filter((kw) => normalized.includes(kw));

  const matchedKeywords = Array.from(
    new Set([...matchedHot, ...matchedQ].map((k) => k.trim()))
  ).slice(0, 4);

  if (matchedHot.length > 0) {
    return { priority: 'hot', matchedKeywords };
  }
  if (matchedQ.length > 0) {
    return { priority: 'question', matchedKeywords };
  }
  return { priority: 'normal', matchedKeywords: [] };
}

export function shouldAutoReadComment(
  comment: Pick<LiveComment, 'priority' | 'answered'>,
  mode: AutoReadFilterMode
): boolean {
  if (comment.answered) return false;
  if (mode === 'all') return true;
  if (mode === 'hot-only') return comment.priority === 'hot';
  return comment.priority === 'hot' || comment.priority === 'question';
}

export function formatSpeechText(comment: Pick<LiveComment, 'user' | 'text' | 'priority'>): string {
  const cleanUser = (comment.user || 'Khách hàng').replace(/[@#]/g, '').trim();
  const cleanText = (comment.text || '').trim();
  if (comment.priority === 'hot') {
    return `Chốt đơn từ ${cleanUser}: ${cleanText}`;
  }
  if (comment.priority === 'question') {
    return `${cleanUser} hỏi: ${cleanText}`;
  }
  return `${cleanUser} bình luận: ${cleanText}`;
}

export interface NormalizedExternalResult {
  comment?: LiveComment;
  alert?: LiveAlert;
}

/**
 * Normalizes incoming webhook or TikFinity WebSocket events from TikTok Live / external apps
 * into PocketLive comments and/or stage alerts.
 */
export function normalizeExternalEvent(
  raw: Record<string, unknown>
): NormalizedExternalResult | null {
  const eventType = String(raw.type || raw.event || 'comment').toLowerCase();
  const data = (typeof raw.data === 'object' && raw.data !== null
    ? raw.data
    : raw) as Record<string, unknown>;

  const user = String(
    data.user ||
      data.nickname ||
      data.uniqueId ||
      raw.user ||
      raw.nickname ||
      'Khách Live'
  ).trim();

  const message = String(
    data.message || data.comment || data.text || raw.message || raw.text || ''
  ).trim();

  const rawPlatform = String(raw.platform || data.platform || 'tiktok').toLowerCase();
  const platform: CommentPlatform =
    rawPlatform === 'shopee' ||
    rawPlatform === 'facebook' ||
    rawPlatform === 'webhook' ||
    rawPlatform === 'studio'
      ? rawPlatform
      : 'tiktok';

  const now = Date.now();
  const id = String(raw.id || data.msgId || `evt-${now}-${Math.random().toString(36).slice(2, 7)}`);

  if (eventType === 'gift') {
    const giftName = String(data.giftName || raw.giftName || 'Quà VIP');
    const text = message || `vừa tặng ${giftName}`;
    return {
      comment: {
        id,
        user,
        text,
        platform,
        timestamp: now,
        priority: 'hot',
        matchedKeywords: ['quà tặng'],
        answered: false,
        giftName,
      },
      alert: {
        id: `alert-${id}`,
        type: 'gift',
        title: `${user} vừa tặng ${giftName}!`,
        subtitle: 'Cảm ơn tình cảm siêu dễ thương trên Live',
        timestamp: now,
      },
    };
  }

  if (eventType === 'order') {
    const text = message || 'vừa chốt đơn thành công trên phiên Live!';
    return {
      comment: {
        id,
        user,
        text,
        platform,
        timestamp: now,
        priority: 'hot',
        matchedKeywords: ['chốt đơn'],
        answered: false,
      },
      alert: {
        id: `alert-${id}`,
        type: 'order',
        title: `${user} vừa chốt đơn thành công!`,
        subtitle: message || 'Cảm ơn đã ủng hộ phiên Live hôm nay',
        timestamp: now,
      },
    };
  }

  if (eventType === 'like' || eventType === 'hearts') {
    return {
      alert: {
        id: `alert-${id}`,
        type: 'hearts',
        title: `${user} đang thả bão tim!`,
        subtitle: 'Tiếp tục thả tim mở khóa thêm ưu đãi',
        timestamp: now,
      },
    };
  }

  // Default: chat / comment
  if (!message) return null;
  const { priority, matchedKeywords } = classifyComment(message);
  return {
    comment: {
      id,
      user,
      text: message,
      platform,
      timestamp: now,
      priority,
      matchedKeywords,
      answered: false,
    },
  };
}
