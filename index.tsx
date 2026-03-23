
/**
 * @fileoverview Control real time music with a MIDI controller
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PlaybackState, Prompt } from './types';
import { PromptDjMidi } from './components/PromptDjMidi';
import { ToastMessage } from './components/ToastMessage';
import { LiveMusicHelper } from './utils/LiveMusicHelper';
import { AudioAnalyser } from './utils/AudioAnalyser';

const model = 'gemini-3-flash-preview';

async function main() {
  const startApp = async () => {
    const initialPrompts = buildInitialPrompts();

    // Cast to any to fix inheritance recognition issues in this environment
    const pdjMidi = new PromptDjMidi(initialPrompts) as any;
    document.body.appendChild(pdjMidi);

    const toastMessage = new ToastMessage() as any;
    document.body.appendChild(toastMessage);

    const liveMusicHelper = new LiveMusicHelper(model);
    liveMusicHelper.setWeightedPrompts(initialPrompts);

    const audioAnalyser = new AudioAnalyser(liveMusicHelper.audioContext);
    liveMusicHelper.extraDestination = audioAnalyser.node;

    pdjMidi.addEventListener('prompts-changed', ((e: Event) => {
      const customEvent = e as CustomEvent<Map<string, Prompt>>;
      const prompts = customEvent.detail;
      liveMusicHelper.setWeightedPrompts(prompts);
    }));

    pdjMidi.addEventListener('play-pause', () => {
      liveMusicHelper.playPause();
    });

    liveMusicHelper.addEventListener('playback-state-changed', ((e: Event) => {
      const customEvent = e as CustomEvent<PlaybackState>;
      const playbackState = customEvent.detail;
      pdjMidi.playbackState = playbackState;
      playbackState === 'playing' ? audioAnalyser.start() : audioAnalyser.stop();
    }));

    const errorToast = ((e: Event) => {
      const customEvent = e as CustomEvent<string>;
      const error = customEvent.detail;
      toastMessage.show(error);
    });

    liveMusicHelper.addEventListener('error', errorToast);
    pdjMidi.addEventListener('error', errorToast);

    audioAnalyser.addEventListener('audio-level-changed', ((e: Event) => {
      const customEvent = e as CustomEvent<number>;
      const level = customEvent.detail;
      pdjMidi.audioLevel = level;
    }));
  };

  // Start directly without billing check
  startApp();
}

function buildInitialPrompts() {
  const startOn = [...DEFAULT_PROMPTS]
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);

  const prompts = new Map<string, Prompt>();
  const baseNote = 36;

  for (let i = 0; i < DEFAULT_PROMPTS.length; i++) {
    const promptId = `prompt-${i}`;
    const prompt = DEFAULT_PROMPTS[i];
    const { text, color } = prompt;
    prompts.set(promptId, {
      promptId,
      text,
      weight: startOn.includes(prompt) ? 1 : 0,
      cc: i,
      note: baseNote + i,
      color,
    });
  }

  return prompts;
}

const DEFAULT_PROMPTS = [
  { color: '#FF3B30', text: 'Crisp Apple: Bright Staccato Violins' },
  { color: '#4CD964', text: 'Garden Broccoli: Earthy Cello Bassline' },
  { color: '#FF9500', text: 'Sweet Carrot: Bouncy Spiccato Strings' },
  { color: '#5856D6', text: 'Royal Eggplant: Rich Viola Textures' },
  { color: '#FFCC00', text: 'Ripe Banana: Mellow Legato Cello' },
  { color: '#007AFF', text: 'Wild Blueberry: Sparkling Pizzicato' },
  { color: '#FF2D55', text: 'Juicy Tomato: Warm Orchestral Strings' },
  { color: '#28CD41', text: 'Tuscan Kale: Rhythmic String Counterpoint' },
  { color: '#FF6437', text: 'Plump Pumpkin: Grand Orchestral Accents' },
  { color: '#FF5E9D', text: 'Spring Radish: High-pitched Flute Trills' },
  { color: '#FFD600', text: 'Golden Corn: Shimmering Harp Harmonics' },
  { color: '#8E8E93', text: 'Fresh Asparagus: Slender Oboe Melodies' },
  { color: '#AF52DE', text: 'Purple Grapes: Plucked Marimba-like Notes' },
  { color: '#FFF44F', text: 'Zesty Lemon: Sharp Guitar Riffs' },
  { color: '#006A4E', text: 'Baby Spinach: Soft Acoustic Guitar' },
  { color: '#FFA07A', text: 'Velvet Peach: Romantic Guitar Arpeggios' },
];

main();
