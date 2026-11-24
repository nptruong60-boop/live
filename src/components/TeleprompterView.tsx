import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Pin,
  PinOff,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  LiveComment,
  LiveRuntimeState,
  StudioProject,
} from '../types/studio';
import {
  formatSpeechText,
  shouldAutoReadComment,
  type AutoReadFilterMode,
} from '../utils/commentFilter';
import { formatMMSS, formatVND } from '../utils/format';

interface TeleprompterViewProps {
  roomId: string;
  project: StudioProject;
  live: LiveRuntimeState;
  comments: LiveComment[];
  wsConnected: boolean;
  onPinComment: (commentId: string | null, showOnStage?: boolean) => void;
  onToggleAnswered: (commentId: string) => void;
  onClearComments: () => void;
}

export const TeleprompterView: React.FC<TeleprompterViewProps> = ({
  roomId,
  project,
  live,
  comments,
  wsConnected,
  onPinComment,
  onToggleAnswered,
  onClearComments,
}) => {
  const [autoRead, setAutoRead] = useState(false);
  const [filterMode, setFilterMode] = useState<AutoReadFilterMode>('priority');
  const [speechRate, setSpeechRate] = useState(1.1);
  const [fontScale, setFontScale] = useState<'lg' | 'xl' | '2xl'>('xl');
  const [showOnlyPriority, setShowOnlyPriority] = useState(false);

  const spokenIdsRef = useRef<Set<string>>(new Set());

  const pinnedComment = useMemo(
    () => comments.find((c) => c.id === live.pinnedCommentId) || comments[0] || null,
    [comments, live.pinnedCommentId]
  );

  const activeProduct = useMemo(
    () => project.products.find((p) => p.id === live.activeProductId) || null,
    [live.activeProductId, project.products]
  );

  const visibleComments = useMemo(() => {
    if (!showOnlyPriority) return comments;
    return comments.filter((c) => c.priority === 'hot' || c.priority === 'question');
  }, [comments, showOnlyPriority]);

  // Mark existing comments as already seen when first enabling autoRead so it only reads new ones
  const toggleAutoRead = () => {
    if (!autoRead) {
      comments.forEach((c) => spokenIdsRef.current.add(c.id));
      setAutoRead(true);
      if ('speechSynthesis' in window) {
        const cue = new SpeechSynthesisUtterance('Đã bật đọc bình luận tự động');
        cue.lang = 'vi-VN';
        cue.rate = speechRate;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(cue);
      }
    } else {
      setAutoRead(false);
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }
  };

  // Auto-read incoming comments via Web Speech API (Vietnamese vi-VN)
  useEffect(() => {
    if (!autoRead || !('speechSynthesis' in window)) return;
    const unread = comments.filter(
      (c) => !spokenIdsRef.current.has(c.id) && shouldAutoReadComment(c, filterMode)
    );
    if (unread.length === 0) return;

    // Speak oldest unread first
    const ordered = [...unread].reverse();
    for (const cmt of ordered) {
      spokenIdsRef.current.add(cmt.id);
      const utter = new SpeechSynthesisUtterance(formatSpeechText(cmt));
      utter.lang = 'vi-VN';
      utter.rate = speechRate;
      window.speechSynthesis.speak(utter);
    }
  }, [autoRead, comments, filterMode, speechRate]);

  const speakSingle = (cmt: LiveComment) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(formatSpeechText(cmt));
    utter.lang = 'vi-VN';
    utter.rate = speechRate;
    window.speechSynthesis.speak(utter);
  };

  const spotlightTextClass =
    fontScale === '2xl'
      ? 'text-3xl sm:text-4xl leading-snug'
      : fontScale === 'xl'
        ? 'text-2xl sm:text-3xl leading-snug'
        : 'text-xl sm:text-2xl leading-snug';

  return (
    <div className="min-h-screen bg-[#07090f] text-zinc-100 flex flex-col">
      {/* Compact Header (<= 10% mobile height) */}
      <header className="px-4 py-3 border-b border-white/10 bg-[#0d1017] flex items-center justify-between gap-2 sticky top-0 z-30">
        <div className="min-w-0">
          <div className="font-display text-sm font-bold text-white truncate">
            Màn hình Đọc Comment Host
          </div>
          <div className="text-[11px] text-zinc-400">
            Phòng <span className="font-mono-num text-indigo-300">{roomId}</span> ·{' '}
            {wsConnected ? 'Đồng bộ trực tuyến' : 'Đang kết nối...'}
          </div>
        </div>

        <button
          type="button"
          onClick={toggleAutoRead}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            autoRead
              ? 'bg-emerald-600 text-white'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white'
          }`}
        >
          {autoRead ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          <span>{autoRead ? 'Đang tự đọc' : 'Bật đọc tự động'}</span>
        </button>
      </header>

      {/* Auto-Read & Display Controls */}
      <div className="px-4 py-2.5 bg-[#11151e] border-b border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <select
            aria-label="Bộ lọc đọc tự động"
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as AutoReadFilterMode)}
            className="bg-[#0b0e14] border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white"
          >
            <option value="priority">Chỉ đọc hỏi giá & chốt đơn</option>
            <option value="hot-only">Chỉ đọc khách chốt đơn</option>
            <option value="all">Đọc tất cả bình luận</option>
          </select>

          <select
            aria-label="Tốc độ giọng đọc"
            value={speechRate}
            onChange={(e) => setSpeechRate(Number(e.target.value))}
            className="bg-[#0b0e14] border border-white/15 rounded-lg px-2 py-1.5 text-xs font-mono-num text-white"
          >
            <option value={0.95}>0.95x</option>
            <option value={1.1}>1.1x</option>
            <option value={1.3}>1.3x</option>
          </select>
        </div>

        <div className="flex items-center gap-1">
          {(['lg', 'xl', '2xl'] as const).map((sz) => (
            <button
              key={sz}
              type="button"
              onClick={() => setFontScale(sz)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase cursor-pointer ${
                fontScale === sz ? 'bg-indigo-600 text-white' : 'bg-[#1b2230] text-zinc-400'
              }`}
            >
              {sz}
            </button>
          ))}
        </div>
      </div>

      {/* ENLARGED PINNED COMMENT SPOTLIGHT FOR HOST READING */}
      <section className="p-4 border-b border-white/10 bg-[#0d121d]">
        {pinnedComment ? (
          <div className="max-w-3xl mx-auto rounded-2xl bg-[#151c2c] border border-indigo-400/60 p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="font-bold text-indigo-300 truncate">
                {live.pinnedCommentId === pinnedComment.id ? 'ĐANG GHIM PHÓNG TO' : 'BÌNH LUẬN MỚI NHẤT'} ·{' '}
                <span className="text-white">{pinnedComment.user}</span>
              </div>
              <span
                className={`font-bold shrink-0 ${
                  pinnedComment.priority === 'hot'
                    ? 'text-rose-400'
                    : pinnedComment.priority === 'question'
                      ? 'text-amber-300'
                      : 'text-zinc-400'
                }`}
              >
                {pinnedComment.priority === 'hot'
                  ? 'KHÁCH CHỐT ĐƠN'
                  : pinnedComment.priority === 'question'
                    ? 'CẦN TƯ VẤN'
                    : 'BÌNH LUẬN'}
              </span>
            </div>

            <p className={`font-display font-extrabold text-white ${spotlightTextClass}`}>
              “{pinnedComment.text}”
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => speakSingle(pinnedComment)}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Volume2 className="w-4 h-4" />
                <span>Đọc to câu này</span>
              </button>
              <button
                type="button"
                onClick={() => onToggleAnswered(pinnedComment.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                  pinnedComment.answered
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white/10 hover:bg-white/15 text-white'
                }`}
              >
                <Check className="w-4 h-4" />
                <span>{pinnedComment.answered ? 'Đã tư vấn xong' : 'Đánh dấu đã tư vấn'}</span>
              </button>
              {live.pinnedCommentId === pinnedComment.id && (
                <button
                  type="button"
                  onClick={() => onPinComment(null, false)}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-300 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <PinOff className="w-3.5 h-3.5" />
                  <span>Bỏ ghim</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto text-center py-8 text-sm text-zinc-400">
            Chưa có bình luận nào. Khi khách bình luận trên TikTok Live hoặc nhân viên gửi câu hỏi, nội dung sẽ phóng to tại đây.
          </div>
        )}
      </section>

      {/* SCROLLABLE COMMENT QUEUE */}
      <main className="flex-1 overflow-y-auto p-4 max-w-3xl w-full mx-auto space-y-2.5 pb-24">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowOnlyPriority(false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                !showOnlyPriority ? 'bg-white text-zinc-950' : 'bg-[#161c28] text-zinc-400'
              }`}
            >
              Tất cả ({comments.length})
            </button>
            <button
              type="button"
              onClick={() => setShowOnlyPriority(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                showOnlyPriority ? 'bg-amber-400 text-zinc-950' : 'bg-[#161c28] text-zinc-400'
              }`}
            >
              Ưu tiên tư vấn
            </button>
          </div>
          {comments.length > 0 && (
            <button
              type="button"
              onClick={onClearComments}
              className="text-xs text-zinc-400 hover:text-rose-400 flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa danh sách</span>
            </button>
          )}
        </div>

        {visibleComments.map((cmt) => {
          const isPinned = live.pinnedCommentId === cmt.id;
          return (
            <div
              key={cmt.id}
              className={`p-3.5 rounded-2xl border transition ${
                isPinned
                  ? 'bg-indigo-600/20 border-indigo-400'
                  : cmt.answered
                    ? 'bg-[#11151e]/50 border-white/5 opacity-55'
                    : 'bg-[#11151e] border-white/10'
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-bold text-white">
                  {cmt.user} <span className="font-normal text-zinc-400">· {cmt.platform}</span>
                </span>
                <span
                  className={`font-semibold ${
                    cmt.priority === 'hot'
                      ? 'text-rose-400'
                      : cmt.priority === 'question'
                        ? 'text-amber-300'
                        : 'text-zinc-500'
                  }`}
                >
                  {cmt.priority === 'hot'
                    ? 'Chốt đơn'
                    : cmt.priority === 'question'
                      ? 'Hỏi tư vấn'
                      : 'Thường'}
                </span>
              </div>
              <p className="text-base font-semibold text-zinc-100 mt-1.5 leading-snug">
                {cmt.text}
              </p>
              <div className="flex items-center gap-2 mt-2.5">
                <button
                  type="button"
                  onClick={() => onPinComment(cmt.id, live.showPinnedOnStage)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600/25 hover:bg-indigo-600/40 text-indigo-200 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Pin className="w-3.5 h-3.5" />
                  <span>Phóng to</span>
                </button>
                <button
                  type="button"
                  onClick={() => speakSingle(cmt)}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-200 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Đọc</span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleAnswered(cmt.id)}
                  className="ml-auto px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-200 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{cmt.answered ? 'Đã tư vấn' : 'Xong'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </main>

      {/* Compact Active Product & Flash Sale Reminder Bar for Host */}
      <footer className="fixed bottom-0 inset-x-0 bg-[#11151e]/95 border-t border-white/15 px-4 py-2.5 backdrop-blur-md">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3 text-xs">
          {activeProduct ? (
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="font-bold text-indigo-300 shrink-0 whitespace-nowrap">{activeProduct.code}</span>
              <span className="text-zinc-500 shrink-0">·</span>
              <span className="text-zinc-200 font-semibold truncate">{activeProduct.name}</span>
            </div>
          ) : (
            <span className="text-zinc-400 truncate">Chưa ghim sản phẩm trên màn Live</span>
          )}
          <div className="flex items-center gap-3 shrink-0 font-mono-num">
            {activeProduct && (
              <span className="text-sm font-black text-emerald-400">
                {formatVND(activeProduct.livePrice)}
              </span>
            )}
            {live.flashActive && (
              <span className="text-sm font-black text-rose-400">
                ⚡ {formatMMSS(live.flashLeft)}
              </span>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};
