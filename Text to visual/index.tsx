/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI, GenerateContentResponse, Type} from '@google/genai';
import {LitElement, css, html, nothing} from 'lit';
import {customElement, state, query} from 'lit/decorators.js';

interface StoryPart {
  narration: string;
  visuals: string[];
}

type WritableStateKeys =
  | 'prompt'
  | 'visualStyle'
  | 'positivePrompt'
  | 'negativePrompt';

@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  // State
  @state() private prompt = '';
  @state() private story: StoryPart[] = [];
  @state() private frames: string[][] = [];
  @state() private visualStyle = 'cinematic';
  @state() private positivePrompt = '';
  @state() private negativePrompt = '';
  @state() private availableVoices: SpeechSynthesisVoice[] = [];
  @state() private selectedVoiceURI = '';
  @state() private isLoading = false;
  @state() private loadingStatus = '';
  @state() private error = '';
  @state() private currentPart = 0;
  @state() private currentFrameInPart = 0;
  @state() private isPlaying = false;

  // Internals
  private client: GoogleGenAI;
  private animationIntervalId: number | null = null;
  private utterance: SpeechSynthesisUtterance | null = null;

  @query('input') private promptInput!: HTMLInputElement;

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      max-width: 900px;
      height: 80vh;
      max-height: 700px;
      margin: 20px;
      background-color: var(--nlm-surface-panel);
      border-radius: 1rem;
      box-shadow: var(--nlm-shadow-1), var(--nlm-shadow-2);
      overflow: hidden;
    }

    .container {
      display: flex;
      flex-direction: row;
      height: 100%;
      width: 100%;
    }

    .preview-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      border-right: 1px solid var(--nlm-stroke);
    }

    .preview-area {
      flex-grow: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      overflow: hidden;
      position: relative;
      background-color: var(--nlm-surface-page);
    }

    .visual-description {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 2rem;
      color: var(--nlm-text-primary);
      font-size: 1.25rem;
      line-height: 1.6;
      background-color: var(--nlm-surface-panel);
      border: 1px dashed var(--nlm-stroke);
      border-radius: 0.5rem;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      overflow-y: auto;
    }

    .visual-description p {
      margin: 0;
    }

    .status-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      color: white;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      text-align: center;
    }

    .placeholder,
    .error-message {
      font-size: 1.125rem;
      color: var(--nlm-text-secondary);
      text-align: center;
      padding: 2rem;
    }

    .error-message {
      color: var(--nlm-recording);
    }

    .controls-container {
      flex-shrink: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      border-top: 1px solid var(--nlm-stroke);
    }

    .control-button {
      outline: none;
      border: 1px solid var(--nlm-stroke);
      background: var(--nlm-surface-panel);
      color: var(--nlm-text-primary);
      border-radius: 50%;
      width: 44px;
      height: 44px;
      padding: 0;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.2s ease;
    }

    .control-button:hover {
      background-color: var(--nlm-primary-accent-light);
    }

    .control-button:disabled {
      background-color: var(--nlm-surface-page);
      color: var(--nlm-text-secondary);
      cursor: not-allowed;
    }

    .control-button svg {
      width: 24px;
      height: 24px;
      fill: currentColor;
    }

    .config-panel {
      width: 320px;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      overflow-y: auto;
    }

    .config-section {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .config-section label {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--nlm-text-secondary);
    }

    input[type='text'],
    select,
    textarea {
      width: 100%;
      background-color: var(--nlm-surface-page);
      border: 1px solid var(--nlm-stroke);
      border-radius: 0.5rem;
      padding: 0.65rem 0.75rem;
      font-family: inherit;
      font-size: 1rem;
      color: var(--nlm-text-primary);
      outline: none;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
      box-sizing: border-box;
      resize: vertical;
    }

    textarea {
      min-height: 60px;
    }

    input[type='text']:focus,
    select:focus,
    textarea:focus {
      border-color: var(--nlm-primary-accent);
      box-shadow: 0 0 0 2px var(--nlm-primary-accent-pulse);
    }

    .generate-button {
      width: 100%;
      padding: 0.75rem;
      background: var(--nlm-primary-accent);
      color: var(--nlm-surface-panel);
      border: none;
      border-radius: 1.5rem;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.2s ease;
      margin-top: auto; /* Push to bottom */
    }

    .generate-button:hover:not(:disabled) {
      background-color: var(--nlm-primary-accent-hover);
    }

    .generate-button:disabled {
      background-color: var(--nlm-text-secondary);
      cursor: not-allowed;
      opacity: 0.7;
    }

    .spinner {
      width: 32px;
      height: 32px;
      border: 4px solid rgba(255, 255, 255, 0.3);
      border-bottom-color: #fff;
      border-radius: 50%;
      display: inline-block;
      box-sizing: border-box;
      animation: rotation 1s linear infinite;
      margin-bottom: 1rem;
    }

    @keyframes rotation {
      0% {
        transform: rotate(0deg);
      }
      100% {
        transform: rotate(360deg);
      }
    }
  `;

  constructor() {
    super();
    this.client = new GoogleGenAI({
      apiKey: process.env.API_KEY,
    });
    this.populateVoiceList = this.populateVoiceList.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this.populateVoiceList();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = this.populateVoiceList;
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stopStory();
  }

  private populateVoiceList() {
    this.availableVoices = speechSynthesis.getVoices();
    if (this.availableVoices.length > 0 && !this.selectedVoiceURI) {
      // Prefer a Google voice if available, otherwise default to the first.
      const googleVoice = this.availableVoices.find((v) =>
        v.name.includes('Google'),
      );
      this.selectedVoiceURI = googleVoice
        ? googleVoice.voiceURI
        : this.availableVoices[0].voiceURI;
    }
  }

  private handleInput(e: Event, field: WritableStateKeys) {
    this[field] = (e.target as HTMLInputElement).value;
  }

  private handleVoiceChange(e: Event) {
    this.selectedVoiceURI = (e.target as HTMLSelectElement).value;
  }

  private async generateStory() {
    if (!this.prompt || this.isLoading) {
      return;
    }
    this.resetState();
    this.isLoading = true;

    try {
      // 1. Generate Script and Storyboard
      this.loadingStatus = 'Generating script and storyboard...';
      const script = await this.generateScript();

      if (!script || script.length === 0) {
        throw new Error('The generated script was empty.');
      }
      this.story = script;

      // 2. Extract visual descriptions as "frames"
      const textFrames = this.story.map((part) => part.visuals);
      this.frames = textFrames;

      if (this.frames.flat().length === 0) {
        console.warn('Script generated with no visuals.');
      }
    } catch (e) {
      console.error(e);
      this.error = `Error generating story: ${
        (e as Error).message
      }. Check console for details.`;
    } finally {
      this.isLoading = false;
      this.loadingStatus = '';
    }
  }

  private async generateScript(): Promise<StoryPart[]> {
    const partsCount = 4;
    const framesPerPart = 5;
    const prompt = `
      You are a storyboard and script writer for a nominee award-winning short film.
      Based on the user's idea: "${this.prompt}", write a script for a short, ${partsCount}-part animated story.
      The visual style is "${this.visualStyle}".

      The user wants to INCLUDE the following themes or items: "${this.positivePrompt}".
      The user wants to EXCLUDE the following themes or items: "${this.negativePrompt}".

      For each of the ${partsCount} parts, provide:
      1. A single, concise narration sentence.
      2. An array of exactly ${framesPerPart} detailed visual descriptions for an image generator. These descriptions must create a smooth, continuous animation, like frames in a 5fps sequence. Each description should logically follow the previous one.

      Respond in JSON format.
    `;

    const response = await this.client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        thinkingConfig: {thinkingBudget: 0},
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            story: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  narration: {type: Type.STRING},
                  visuals: {
                    type: Type.ARRAY,
                    items: {type: Type.STRING},
                  },
                },
              },
            },
          },
        },
      },
    });

    const jsonResponse = JSON.parse(response.text);
    return jsonResponse.story;
  }

  private playStory() {
    if (this.isPlaying || this.story.length === 0) return;
    this.isPlaying = true;
    this.currentPart = -1; // Will be incremented to 0 by speakAndAnimate
    this.speakAndAnimate(0);
  }

  private speakAndAnimate(partIndex: number) {
    if (partIndex >= this.story.length) {
      this.stopStory();
      return;
    }

    this.currentPart = partIndex;
    this.currentFrameInPart = 0;

    // Stop any previous animation
    if (this.animationIntervalId) {
      clearInterval(this.animationIntervalId);
    }

    // Start new animation loop for the current part, if frames exist
    if (
      this.frames[this.currentPart] &&
      this.frames[this.currentPart].length > 0
    ) {
      this.animationIntervalId = window.setInterval(() => {
        this.currentFrameInPart =
          (this.currentFrameInPart + 1) % this.frames[this.currentPart].length;
      }, 200); // 200ms for 5fps
    }

    // Speak narration for the current part
    this.utterance = new SpeechSynthesisUtterance(
      this.story[partIndex].narration,
    );
    const selectedVoice = this.availableVoices.find(
      (v) => v.voiceURI === this.selectedVoiceURI,
    );
    if (selectedVoice) {
      this.utterance.voice = selectedVoice;
    }

    this.utterance.onend = () => {
      if (this.isPlaying) {
        this.speakAndAnimate(partIndex + 1);
      }
    };

    speechSynthesis.speak(this.utterance);
  }

  private stopStory() {
    this.isPlaying = false;
    speechSynthesis.cancel();
    if (this.animationIntervalId) {
      clearInterval(this.animationIntervalId);
      this.animationIntervalId = null;
    }
  }

  private togglePlay() {
    if (this.isPlaying) {
      this.stopStory();
    } else {
      this.playStory();
    }
  }

  private replayStory() {
    this.stopStory();
    setTimeout(() => this.playStory(), 100);
  }

  private resetState() {
    this.stopStory();
    this.story = [];
    this.frames = [];
    this.error = '';
    this.isLoading = false;
    this.currentPart = 0;
    this.currentFrameInPart = 0;
  }

  render() {
    const renderPreview = () => {
      if (this.isLoading) {
        return html`
          <div class="status-overlay">
            <div class="spinner"></div>
            <p>${this.loadingStatus}</p>
          </div>
        `;
      }
      if (this.error) {
        return html`<p class="error-message">${this.error}</p>`;
      }
      if (
        this.frames.length > 0 &&
        this.frames[this.currentPart] &&
        this.frames[this.currentPart][this.currentFrameInPart]
      ) {
        return html`<div class="visual-description">
          <p>${this.frames[this.currentPart][this.currentFrameInPart]}</p>
        </div>`;
      }
      return html`<p class="placeholder">Enter a story idea to begin</p>`;
    };

    const renderControls = () => {
      if (this.isLoading || this.story.length === 0) {
        return nothing;
      }
      return html`
        <div class="controls-container">
          <button
            class="control-button"
            @click=${this.togglePlay}
            title=${this.isPlaying ? 'Pause' : 'Play'}
          >
            ${this.isPlaying
              ? html`<svg
                  xmlns="http://www.w3.org/2000/svg"
                  height="24px"
                  viewBox="0 0 24 24"
                  width="24px"
                >
                  <path d="M0 0h24v24H0V0z" fill="none" />
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>`
              : html`<svg
                  xmlns="http://www.w3.org/2000/svg"
                  height="24px"
                  viewBox="0 0 24 24"
                  width="24px"
                >
                  <path d="M0 0h24v24H0V0z" fill="none" />
                  <path d="M8 5v14l11-7L8 5z" />
                </svg>`}
          </button>
          <button
            class="control-button"
            @click=${this.replayStory}
            title="Replay"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="24px"
              viewBox="0 0 24 24"
              width="24px"
            >
              <path d="M0 0h24v24H0V0z" fill="none" />
              <path
                d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"
              />
            </svg>
          </button>
        </div>
      `;
    };

    return html`
      <div class="container">
        <div class="preview-container">
          <div class="preview-area">${renderPreview()}</div>
          ${renderControls()}
        </div>

        <div class="config-panel">
          <div class="config-section">
            <label for="prompt">Story Idea</label>
            <textarea
              id="prompt"
              placeholder="e.g., A robot learning to paint a sunset"
              .value=${this.prompt}
              @input=${(e: Event) => this.handleInput(e, 'prompt')}
              .disabled=${this.isLoading}
            ></textarea>
          </div>
          <div class="config-section">
            <label for="style">Visual Style</label>
            <input
              id="style"
              type="text"
              placeholder="e.g., watercolor, pixel art"
              .value=${this.visualStyle}
              @input=${(e: Event) => this.handleInput(e, 'visualStyle')}
              .disabled=${this.isLoading}
            />
          </div>
          <div class="config-section">
            <label for="positive-prompt">What to Include</label>
            <textarea
              id="positive-prompt"
              placeholder="e.g., vibrant colors, happy robot"
              .value=${this.positivePrompt}
              @input=${(e: Event) => this.handleInput(e, 'positivePrompt')}
              .disabled=${this.isLoading}
            ></textarea>
          </div>
          <div class="config-section">
            <label for="negative-prompt">What not to Include</label>
            <textarea
              id="negative-prompt"
              placeholder="e.g., sad faces, dark clouds"
              .value=${this.negativePrompt}
              @input=${(e: Event) => this.handleInput(e, 'negativePrompt')}
              .disabled=${this.isLoading}
            ></textarea>
          </div>
          <div class="config-section">
            <label for="voice">Narration Voice</label>
            <select
              id="voice"
              .value=${this.selectedVoiceURI}
              @change=${this.handleVoiceChange}
              .disabled=${this.isLoading}
            >
              ${this.availableVoices.map(
                (voice) => html`
                  <option value=${voice.voiceURI}>
                    ${voice.name} (${voice.lang})
                  </option>
                `,
              )}
            </select>
          </div>

          <button
            class="generate-button"
            @click=${this.generateStory}
            .disabled=${this.isLoading || !this.prompt}
            title="Generate Story"
          >
            Generate Story
          </button>
        </div>
      </div>
    `;
  }
}
