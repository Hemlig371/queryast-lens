import { useSyncExternalStore } from 'react';

// Узкий экран (телефон): тот же порог, что у Tailwind `max-md:` (меньше 768 px).
// Подписка одна, на `change` у matchMedia: состояние меняется только при пересечении порога,
// а не на каждый resize, поэтому лишних перерисовок App нет.
const NARROW_QUERY = '(max-width: 767px)';

export const isNarrowNow = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(NARROW_QUERY).matches;

const subscribe = (onChange: () => void): (() => void) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia(NARROW_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
};

export const useIsNarrow = (): boolean => useSyncExternalStore(subscribe, isNarrowNow, () => false);
