import { ImageItem, Submission, AIModeratorVerdict } from './types';

// All Gemini calls go through the /api proxy (see server/genai.mjs) so the
// API key never ships in the client bundle.
async function callApi<T>(route: string, body: unknown): Promise<T> {
  const response = await fetch(`/api/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    // fetch has no built-in timeout; a stalled request must not hang the
    // game loop (or the startRound in-flight guard) forever.
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || `Request to /api/${route} failed (${response.status})`);
  }
  return response.json();
}

// Browsers block audio that isn't tied to a user gesture, so the context is
// created/resumed from a click handler and reused for playback later.
let audioContext: AudioContext | null = null;

export function unlockAudio() {
  try {
    audioContext ??= new AudioContext({ sampleRate: 24000 });
    if (audioContext.state === 'suspended') void audioContext.resume();
  } catch (e) {
    console.error('Audio unlock failed', e);
  }
}

// Decode raw 16-bit PCM (24kHz mono) from Gemini TTS and play it.
function playRawAudio(base64Data: string) {
  try {
    if (!audioContext) return;
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const dataInt16 = new Int16Array(bytes.buffer);
    const buffer = audioContext.createBuffer(1, dataInt16.length, 24000);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < dataInt16.length; i++) {
      channelData[i] = dataInt16[i] / 32768.0;
    }

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start();
  } catch (e) {
    console.error('Audio playback failed', e);
  }
}

export async function announceWinner(verdict: string) {
  try {
    const { audio } = await callApi<{ audio: string | null }>('announce', { text: verdict });
    if (audio) playRawAudio(audio);
  } catch (e) {
    console.error('TTS generation failed', e);
  }
}

export async function visualizeIntersection(imageA: ImageItem, imageB: ImageItem, winningText: string): Promise<string | null> {
  try {
    const { image } = await callApi<{ image: string | null }>('visualize', { imageA, imageB, winningText });
    return image;
  } catch (error) {
    console.error('Visualizer error:', error);
    return null;
  }
}

export async function getLiveCommentary(imageA: ImageItem, imageB: ImageItem, submissions: Submission[]): Promise<string> {
  try {
    const { text } = await callApi<{ text: string }>('commentary', { imageA, imageB, submissions });
    return text;
  } catch {
    return 'The fusion is imminent!';
  }
}

export async function generateIntersectionLabel(imageA: ImageItem, imageB: ImageItem, submissions: Submission[]): Promise<{ intersectionLabel: string }> {
  try {
    return await callApi<{ intersectionLabel: string }>('label', { imageA, imageB, submissions });
  } catch {
    return { intersectionLabel: 'Fusion Point' };
  }
}

export async function moderateSoloRound(
  imageA: ImageItem,
  imageB: ImageItem,
  submissions: Submission[],
  tone: 'serious' | 'funny' = 'funny'
): Promise<AIModeratorVerdict> {
  return callApi<AIModeratorVerdict>('moderate', { imageA, imageB, submissions, tone });
}

export async function generateAISubmission(imageA: ImageItem, imageB: ImageItem): Promise<string> {
  const { text } = await callApi<{ text: string }>('submission', { imageA, imageB });
  return text;
}
