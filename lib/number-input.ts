// Number inputs for money and meters (commit 28a): "-", "+", "e", "E" cannot be typed and a paste that is not a plain
// number (digits with at most one ".") is refused, so a negative value cannot be entered at all. Spread right after
// type="number" — an input's own min / step written after it still wins. The APIs keep refusing negatives (400).

import type { ClipboardEvent, KeyboardEvent } from 'react';

const BLOCKED_KEYS = new Set(['-', '+', 'e', 'E']);

/** A pasted text that can go into a non-negative number input */
export const isPlainNumber = (text: string) => /^\d*\.?\d*$/.test(text.trim());

export const NUMBER_INPUT_PROPS = {
  min: 0,
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
    if (BLOCKED_KEYS.has(e.key)) e.preventDefault();
  },
  onPaste: (e: ClipboardEvent<HTMLInputElement>) => {
    if (!isPlainNumber(e.clipboardData.getData('text'))) e.preventDefault();
  },
};
