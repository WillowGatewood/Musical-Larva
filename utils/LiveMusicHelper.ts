/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Type } from '@google/genai';
import * as Tone from 'tone';
import type { PlaybackState, Prompt } from '../types';
import { throttle } from './throttle';

interface NoteEvent {
  instrument: 'violin' | 'cello' | 'viola' | 'flute' | 'oboe' | 'harp' | 'marimba' | 'guitar';
  note: string;
  duration: string;
  time: string; // Tone.js time format like "0:0:0"
  velocity: number;
}

interface Composition {
  bpm: number;
  scale: string;
  events: NoteEvent[];
}

export class LiveMusicHelper extends EventTarget {
  private ai: GoogleGenAI;
  private model: string;
  private playbackState: PlaybackState = 'stopped';
  private prompts: Map<string, Prompt> = new Map();
  
  public readonly audioContext: AudioContext;
  public extraDestination: AudioNode | null = null;

  private synths: Map<string, Tone.PolySynth | Tone.Sampler | Tone.MembraneSynth> = new Map();
  private part: Tone.Part | null = null;
  private currentComposition: Composition | null = null;

  constructor(model: string) {
    super();
    this.model = model;
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    this.audioContext = Tone.getContext().rawContext as AudioContext;
    
    this.initSynths();
  }

  private initSynths() {
    const violin = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.8 }
    }).toDestination();

    const cello = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.2, decay: 0.3, sustain: 0.6, release: 1.2 }
    }).toDestination();

    const viola = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.15, decay: 0.25, sustain: 0.5, release: 1.0 }
    }).toDestination();

    const flute = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.1, decay: 0.2, sustain: 0.8, release: 0.5 }
    }).toDestination();

    const oboe = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'square' },
      envelope: { attack: 0.05, decay: 0.1, sustain: 0.4, release: 0.3 }
    }).toDestination();

    const harp = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 1.5, sustain: 0, release: 1.5 }
    }).toDestination();

    const marimba = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.1 }
    }).toDestination();

    const guitar = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.5, sustain: 0.1, release: 1.0 }
    }).toDestination();

    this.synths.set('violin', violin);
    this.synths.set('cello', cello);
    this.synths.set('viola', viola);
    this.synths.set('flute', flute);
    this.synths.set('oboe', oboe);
    this.synths.set('harp', harp);
    this.synths.set('marimba', marimba);
    this.synths.set('guitar', guitar);
  }

  private setPlaybackState(state: PlaybackState) {
    this.playbackState = state;
    this.dispatchEvent(new CustomEvent('playback-state-changed', { detail: state }));
  }

  public setWeightedPrompts = throttle(async (prompts: Map<string, Prompt>) => {
    this.prompts = prompts;
    if (this.playbackState === 'playing') {
      await this.generateComposition();
    }
  }, 1000);

  private async generateComposition() {
    const activePrompts = Array.from(this.prompts.values())
      .filter(p => p.weight > 0)
      .map(p => p.text);

    if (activePrompts.length === 0) return;

    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: `Compose a beautiful 2-bar musical loop based on these garden elements: ${activePrompts.join(', ')}. 
        Create a rich arrangement with melodies, harmonies, and rhythms.
        Return a JSON object representing the composition.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              bpm: { type: Type.NUMBER, description: 'Beats per minute (70-110)' },
              scale: { type: Type.STRING, description: 'Musical scale (e.g. G major, D minor)' },
              events: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    instrument: { type: Type.STRING, enum: ['violin', 'cello', 'viola', 'flute', 'oboe', 'harp', 'marimba', 'guitar'] },
                    note: { type: Type.STRING, description: 'Note like C4, Eb3, G#5' },
                    duration: { type: Type.STRING, description: 'Tone.js duration like 4n, 8n, 16n, 2n' },
                    time: { type: Type.STRING, description: 'Time in bars:beats:sixteenths format (e.g. 0:0:0, 0:1:2, 1:0:0)' },
                    velocity: { type: Type.NUMBER, description: '0.1 to 1.0' }
                  },
                  required: ['instrument', 'note', 'duration', 'time', 'velocity']
                }
              }
            },
            required: ['bpm', 'scale', 'events']
          }
        }
      });

      const composition = JSON.parse(response.text) as Composition;
      this.applyComposition(composition);
    } catch (error) {
      console.error('Failed to generate composition:', error);
      this.dispatchEvent(new CustomEvent('error', { detail: 'The garden is dreaming... try again soon.' }));
    }
  }

  private applyComposition(composition: Composition) {
    this.currentComposition = composition;
    Tone.getTransport().bpm.value = composition.bpm;

    if (this.part) {
      this.part.dispose();
    }

    this.part = new Tone.Part((time, event) => {
      const synth = this.synths.get(event.instrument);
      if (synth) {
        // @ts-ignore - PolySynth and others have triggerAttackRelease
        synth.triggerAttackRelease(event.note, event.duration, time, event.velocity);
      }
    }, composition.events).start(0);

    this.part.loop = true;
    this.part.loopEnd = "2m"; // 2 bars loop
  }

  public async play() {
    await Tone.start();
    this.setPlaybackState('loading');
    await this.generateComposition();
    Tone.getTransport().start();
    this.setPlaybackState('playing');
    
    // Connect to extra destination for visualizer
    if (this.extraDestination) {
      Tone.getDestination().connect(this.extraDestination);
    }
  }

  public pause() {
    Tone.getTransport().pause();
    this.setPlaybackState('paused');
  }

  public stop() {
    Tone.getTransport().stop();
    if (this.part) {
      this.part.dispose();
      this.part = null;
    }
    this.setPlaybackState('stopped');
  }

  public async playPause() {
    if (this.playbackState === 'playing') {
      this.pause();
    } else {
      await this.play();
    }
  }
}
