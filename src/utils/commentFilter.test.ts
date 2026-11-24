import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyComment,
  shouldAutoReadComment,
  formatSpeechText,
  normalizeExternalEvent,
} from './commentFilter';

test('classifyComment detects Vietnamese buying intent as hot', () => {
  const res = classifyComment('Chốt đơn mã 01 serum B5 nha shop!');
  assert.equal(res.priority, 'hot');
  assert.ok(res.matchedKeywords.includes('chốt'));
});

test('classifyComment detects price/consultation questions', () => {
  const res = classifyComment('Da dầu mụn có dùng được không, giá bao nhiêu?');
  assert.equal(res.priority, 'question');
  assert.ok(res.matchedKeywords.includes('giá'));
});

test('classifyComment leaves casual chatter as normal', () => {
  const res = classifyComment('Hello shop xinh quá nè');
  assert.equal(res.priority, 'normal');
  assert.equal(res.matchedKeywords.length, 0);
});

test('shouldAutoReadComment respects filter modes and answered state', () => {
  assert.equal(shouldAutoReadComment({ priority: 'hot', answered: false }, 'hot-only'), true);
  assert.equal(shouldAutoReadComment({ priority: 'question', answered: false }, 'hot-only'), false);
  assert.equal(shouldAutoReadComment({ priority: 'question', answered: false }, 'priority'), true);
  assert.equal(shouldAutoReadComment({ priority: 'normal', answered: false }, 'priority'), false);
  assert.equal(shouldAutoReadComment({ priority: 'normal', answered: false }, 'all'), true);
  assert.equal(shouldAutoReadComment({ priority: 'hot', answered: true }, 'all'), false);
});

test('normalizeExternalEvent handles TikFinity chat and gift payloads', () => {
  const chat = normalizeExternalEvent({
    event: 'chat',
    data: { uniqueId: 'ngoc_vy', comment: 'Mã 02 bao nhiêu vậy ạ?', msgId: 'tk-100' },
  });
  assert.ok(chat?.comment);
  assert.equal(chat.comment.id, 'tk-100');
  assert.equal(chat.comment.user, 'ngoc_vy');
  assert.equal(chat.comment.priority, 'question');

  const gift = normalizeExternalEvent({
    event: 'gift',
    data: { nickname: 'Hoàng Nam', giftName: 'Hoa Hồng' },
  });
  assert.ok(gift?.alert);
  assert.equal(gift.alert.type, 'gift');
  assert.ok(gift.alert.title.includes('Hoàng Nam'));
});

test('formatSpeechText formats Vietnamese host voice cue', () => {
  const speech = formatSpeechText({
    user: '@minhthu',
    text: 'Chốt mã 03',
    priority: 'hot',
  });
  assert.equal(speech, 'Chốt đơn từ minhthu: Chốt mã 03');
});
