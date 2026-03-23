
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import { throttle } from '../utils/throttle';

import './PromptController';
import './PlayPauseButton';
import type { PlaybackState, Prompt } from '../types';
import { MidiDispatcher } from '../utils/MidiDispatcher';

/** The grid of prompt inputs. */
@customElement('prompt-dj-midi')
export class PromptDjMidi extends LitElement {
  static styles = css`
    :host {
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      box-sizing: border-box;
      position: relative;
    }
    #background {
      will-change: background-image;
      position: absolute;
      height: 100%;
      width: 100%;
      z-index: -1;
      background: #111;
    }
    #garden-input {
      display: flex;
      gap: 10px;
      margin-top: 20px;
      padding: 10px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      width: min(80vmin, 600px);
      box-sizing: border-box;
    }
    #garden-input input {
      flex: 1;
      background: #000;
      border: 1px solid #333;
      color: #fff;
      padding: 10px 15px;
      border-radius: 8px;
      font-size: 1.6vmin;
      outline: none;
      transition: border-color 0.2s;
    }
    #garden-input input:focus {
      border-color: #4CD964;
    }
    #garden-input button {
      background: #4CD964;
      color: #000;
      border: none;
      padding: 0 20px;
      border-radius: 8px;
      font-weight: bold;
      cursor: pointer;
      text-transform: uppercase;
      font-size: 1.4vmin;
      transition: transform 0.1s, background-color 0.2s;
    }
    #garden-input button:hover {
      background: #28CD41;
      transform: translateY(-1px);
    }
    #garden-input button:active {
      transform: translateY(0);
    }
    #grid {
      width: 80vmin;
      height: 70vmin;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 2.5vmin;
      margin-top: 4vmin;
      margin-bottom: 2vmin;
    }
    prompt-controller {
      width: 100%;
    }
    play-pause-button {
      position: relative;
      width: 12vmin;
    }
    #buttons {
      position: absolute;
      top: 0;
      left: 0;
      padding: 5px;
      display: flex;
      gap: 5px;
    }
    .midi-btn {
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      color: #fff;
      background: #0002;
      -webkit-font-smoothing: antialiased;
      border: 1.5px solid #fff;
      border-radius: 4px;
      user-select: none;
      padding: 3px 6px;
      &.active {
        background-color: #fff;
        color: #000;
      }
    }
    select {
      font: inherit;
      padding: 5px;
      background: #fff;
      color: #000;
      border-radius: 4px;
      border: none;
      outline: none;
      cursor: pointer;
    }
    @media only screen and (max-width: 600px) {
      #garden-input input { font-size: 14px; }
      #garden-input button { font-size: 12px; }
    }
  `;

  private prompts: Map<string, Prompt>;
  private midiDispatcher: MidiDispatcher;

  @property({ type: Boolean }) private showMidi = false;
  @property({ type: String }) public playbackState: PlaybackState = 'stopped';
  @state() public audioLevel = 0;
  @state() private midiInputIds: string[] = [];
  @state() private activeMidiInputId: string | null = null;
  @state() private customVeggie: string = '';

  @query('#veggie-field') private veggieInput!: HTMLInputElement;

  constructor(
    initialPrompts: Map<string, Prompt>,
  ) {
    super();
    this.prompts = initialPrompts;
    this.midiDispatcher = new MidiDispatcher();
  }

  private handlePromptChanged(e: CustomEvent<Prompt>) {
    const { promptId, text, weight, cc, note } = e.detail;
    const prompt = this.prompts.get(promptId);

    if (!prompt) {
      console.error('prompt not found', promptId);
      return;
    }

    prompt.text = text;
    prompt.weight = weight;
    prompt.cc = cc;
    prompt.note = note;

    const newPrompts = new Map(this.prompts);
    newPrompts.set(promptId, prompt);

    this.prompts = newPrompts;
    (this as any).requestUpdate();

    (this as any).dispatchEvent(
      new CustomEvent('prompts-changed', { detail: this.prompts, bubbles: true, composed: true }),
    );
  }

  /** Generates radial gradients for each prompt based on weight and color. */
  private readonly makeBackground = throttle(
    () => {
      const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

      const MAX_WEIGHT = 0.5;
      const MAX_ALPHA = 0.6;

      const bg: string[] = [];

      [...this.prompts.values()].forEach((p, i) => {
        const alphaPct = clamp01(p.weight / MAX_WEIGHT) * MAX_ALPHA;
        const alpha = Math.round(alphaPct * 0xff)
          .toString(16)
          .padStart(2, '0');

        const stop = p.weight / 2;
        const x = (i % 4) / 3;
        const y = Math.floor(i / 4) / 3;
        const s = `radial-gradient(circle at ${x * 100}% ${y * 100}%, ${p.color}${alpha} 0px, ${p.color}00 ${stop * 100}%)`;

        bg.push(s);
      });

      return bg.join(', ');
    },
    30,
  );

  private toggleShowMidi() {
    return this.setShowMidi(!this.showMidi);
  }

  public async setShowMidi(show: boolean) {
    this.showMidi = show;
    if (!this.showMidi) return;
    try {
      const inputIds = await this.midiDispatcher.getMidiAccess();
      this.midiInputIds = inputIds;
      this.activeMidiInputId = this.midiDispatcher.activeMidiInputId;
    } catch (e: any) {
      this.showMidi = false;
      (this as any).dispatchEvent(new CustomEvent('error', {detail: e.message, bubbles: true, composed: true}));
    }
  }

  private handleMidiInputChange(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    const newMidiId = selectElement.value;
    this.activeMidiInputId = newMidiId;
    this.midiDispatcher.activeMidiInputId = newMidiId;
  }

  private playPause() {
    (this as any).dispatchEvent(new CustomEvent('play-pause', {bubbles: true, composed: true}));
  }

  private plantVeggie() {
    const text = this.veggieInput.value.trim();
    if (!text) return;

    // String instrument articulations to cycle through for new plants
    const articulations = [
      'Bright Staccato Violins',
      'Rich Cello Bassline',
      'Bouncy Spiccato Strings',
      'Lush Pizzicato Violins',
      'Legato Cello Melody',
      'String Harmonics',
      'Romantic Vibrato Cello',
      'Tremolo Violin Textures'
    ];
    const articulation = articulations[Math.floor(Math.random() * articulations.length)];
    const fullPrompt = `${text}: ${articulation}`;

    // Find the least important pad (weight 0 or lowest weight)
    const promptArray = [...this.prompts.values()];
    const target = promptArray.sort((a, b) => a.weight - b.weight)[0];

    if (target) {
      target.text = fullPrompt;
      target.weight = 1.0; // Automatically enable the new plant
      this.handlePromptChanged(new CustomEvent('prompt-changed', { detail: target }));
    }

    this.veggieInput.value = '';
  }

  private handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      this.plantVeggie();
    }
  }

  render() {
    const bg = styleMap({
      backgroundImage: this.makeBackground(),
    });
    return html`<div id="background" style=${bg}></div>
      <div id="buttons">
        <button
          @click=${this.toggleShowMidi}
          class="midi-btn ${this.showMidi ? 'active' : ''}"
          >MIDI</button
        >
        <select
          @change=${this.handleMidiInputChange}
          .value=${this.activeMidiInputId || ''}
          style=${this.showMidi ? '' : 'visibility: hidden'}>
          ${this.midiInputIds.length > 0
        ? this.midiInputIds.map(
          (id) =>
            html`<option value=${id}>
                    ${this.midiDispatcher.getDeviceName(id)}
                  </option>`,
        )
        : html`<option value="">No devices found</option>`}
        </select>
      </div>

      <div id="garden-input">
        <input 
          id="veggie-field" 
          type="text" 
          placeholder="What's in your garden? (e.g. Pineapple)"
          @keydown=${this.handleKeydown}
        >
        <button @click=${this.plantVeggie}>Plant</button>
      </div>

      <div id="grid">${this.renderPrompts()}</div>
      <play-pause-button .playbackState=${this.playbackState} @click=${this.playPause}></play-pause-button>`;
  }

  private renderPrompts() {
    return [...this.prompts.values()].map((prompt) => {
      return html`<prompt-controller
        promptId=${prompt.promptId}
        cc=${prompt.cc}
        note=${prompt.note}
        text=${prompt.text}
        weight=${prompt.weight}
        color=${prompt.color}
        .midiDispatcher=${this.midiDispatcher}
        .showCC=${this.showMidi}
        audioLevel=${this.audioLevel}
        @prompt-changed=${this.handlePromptChanged}>
      </prompt-controller>`;
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'prompt-dj-midi': PromptDjMidi;
  }
}
