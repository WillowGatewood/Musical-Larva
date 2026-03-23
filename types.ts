/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
export interface Prompt {
  readonly promptId: string;
  text: string;
  weight: number;
  cc: number;
  note: number;
  color: string;
}

export interface ControlChange {
  channel: number;
  cc: number;
  value: number;
}

export interface NoteMessage {
  channel: number;
  note: number;
  velocity: number;
}

export type PlaybackState = 'stopped' | 'playing' | 'loading' | 'paused';