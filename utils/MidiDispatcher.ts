/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import type { ControlChange, NoteMessage } from '../types';

/** Simple class for dispatching MIDI CC messages as events. */
export class MidiDispatcher extends EventTarget {
  private access: MIDIAccess | null = null;
  activeMidiInputId: string | null = null;

  async getMidiAccess(): Promise<string[]> {
    if (this.access) {
      return [...this.access.inputs.keys()];
    }

    if (!navigator.requestMIDIAccess) {
      throw new Error(
        'Your browser does not support the Web MIDI API. For a list of compatible browsers, see https://caniuse.com/midi',
      );
    }

    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch (e) {
      throw new Error('Unable to acquire MIDI access.');
    }

    const inputIds = [...this.access.inputs.keys()];

    if (inputIds.length > 0 && this.activeMidiInputId === null) {
      this.activeMidiInputId = inputIds[0];
    }

    for (const input of this.access.inputs.values()) {
      input.onmidimessage = (event: MIDIMessageEvent) => {
        if (input.id !== this.activeMidiInputId) return;

        const { data } = event;
        if (!data) {
          console.error('MIDI message has no data');
          return;
        }

        const statusByte = data[0];
        const channel = statusByte & 0x0f;
        const messageType = statusByte & 0xf0;

        const isNoteOn = messageType === 0x90;
        const isNoteOff = messageType === 0x80;
        const isControlChange = messageType === 0xb0;

        if (isControlChange) {
          const detail: ControlChange = { cc: data[1], value: data[2], channel };
          this.dispatchEvent(
            new CustomEvent<ControlChange>('cc-message', { detail }),
          );
        } else if (isNoteOn && data[2] > 0) { // Note on with velocity > 0
          const detail: NoteMessage = { note: data[1], velocity: data[2], channel };
          this.dispatchEvent(
            new CustomEvent<NoteMessage>('note-on', { detail }),
          );
        } else if (isNoteOff || (isNoteOn && data[2] === 0)) { // Note off, or Note on with velocity 0
          const detail: NoteMessage = { note: data[1], velocity: data[2], channel };
          this.dispatchEvent(
            new CustomEvent<NoteMessage>('note-off', { detail }),
          );
        }
      };
    }

    return inputIds;
  }

  getDeviceName(id: string): string | null {
    if (!this.access) {
      return null;
    }
    const input = this.access.inputs.get(id);
    return input ? input.name : null;
  }
}