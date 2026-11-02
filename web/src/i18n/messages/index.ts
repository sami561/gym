import type { admin } from './admin';
import { core } from './core';

/** Back-office copy: French source text → English / Arabic. */
export type Messages = Record<string, { en: string; ar: string }>;

export type MessageKey = keyof typeof admin;

/**
 * Registry read by translate(): the core strings ship with the public site,
 * the full back-office set is registered when the /admin chunk loads.
 */
export const MESSAGES: Messages = { ...core };

export function registerMessages(messages: Messages): void {
  Object.assign(MESSAGES, messages);
}
