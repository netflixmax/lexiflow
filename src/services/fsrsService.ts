import { createEmptyCard, fsrs, generatorParameters, Rating, State } from 'ts-fsrs';
import type { Card as FsrsCard, Grade } from 'ts-fsrs';
import type { VocabCard } from '../types';

const scheduler = fsrs(
  generatorParameters({
    enable_fuzz: true,
    request_retention: 0.9,
    maximum_interval: 3650,
  }),
);

export { Rating, State };

export function createNewFsrsCard(): FsrsCard {
  return createEmptyCard(new Date());
}

export function getSchedulingPreview(card: FsrsCard): Record<Grade, { card: FsrsCard; label: string }> {
  const now = new Date();
  const preview = scheduler.repeat(card, now);
  return {
    [Rating.Again]: {
      card: preview[Rating.Again].card,
      label: formatInterval(now, preview[Rating.Again].card.due),
    },
    [Rating.Hard]: {
      card: preview[Rating.Hard].card,
      label: formatInterval(now, preview[Rating.Hard].card.due),
    },
    [Rating.Good]: {
      card: preview[Rating.Good].card,
      label: formatInterval(now, preview[Rating.Good].card.due),
    },
    [Rating.Easy]: {
      card: preview[Rating.Easy].card,
      label: formatInterval(now, preview[Rating.Easy].card.due),
    },
  };
}

export function reviewFsrsCard(card: FsrsCard, grade: Grade): FsrsCard {
  const now = new Date();
  const result = scheduler.repeat(card, now);
  return result[grade].card;
}

export function isCardDue(card: VocabCard, now = new Date()): boolean {
  return new Date(card.fsrs.due).getTime() <= now.getTime();
}

export function getCardStatusLabel(card: VocabCard): '新词' | '学习中' | '复习中' | '已掌握' {
  const st = card.fsrs.state;
  if (st === State.New) return '新词';
  if (st === State.Learning || st === State.Relearning) return '学习中';
  if (card.fsrs.stability >= 21) return '已掌握';
  return '复习中';
}

function formatInterval(from: Date, to: Date): string {
  const diffMs = Math.max(0, to.getTime() - from.getTime());
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${Math.max(1, mins)} 分钟`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} 小时`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} 天`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} 个月`;
  const years = (days / 365).toFixed(1);
  return `${years} 年`;
}
