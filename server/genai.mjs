import { GoogleGenAI, Type, Modality } from '@google/genai';

const TEXT_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-2.5-flash-image';
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) reject(new Error('Request body too large'));
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

async function generateCommentary(ai, { imageA, imageB, submissions }) {
  const prompt = `Context: Players are finding connections between "${imageA.title}" and "${imageB.title}".
  Submissions so far: ${submissions.map((s) => s.content).join(', ')}.
  Provide a witty, one-sentence "AI Hype" observation (max 12 words).`;

  const response = await ai.models.generateContent({ model: TEXT_MODEL, contents: prompt });
  return { text: response.text?.trim() || 'Things are getting interesting...' };
}

async function generateLabel(ai, { imageA, imageB, submissions }) {
  const prompt = `Analyze assets "${imageA.title}" and "${imageB.title}" plus these submissions: ${submissions.map((s) => s.content).join(', ')}.
  Give the intersection a single punchy Name (e.g. "Cyber-Forest").`;

  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: { intersectionLabel: { type: Type.STRING } },
        required: ['intersectionLabel'],
      },
    },
  });
  return JSON.parse(response.text || '{"intersectionLabel": "Fusion Point"}');
}

async function moderateRound(ai, { imageA, imageB, submissions, tone = 'funny' }) {
  const prompt = `MODERATOR: Evaluate which submission best bridges "${imageA.title}" and "${imageB.title}".
  Tone: ${tone}.
  Submissions: ${submissions.map((s) => `[${s.playerId}] ${s.content}`).join('\n')}
  Output JSON scores (0-10) for everyone and pick the winnerId. The winnerId must be one of the bracketed player ids.`;

  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          playerScores: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                playerId: { type: Type.STRING },
                score: { type: Type.NUMBER },
              },
            },
          },
          reasoning: { type: Type.STRING },
          winnerId: { type: Type.STRING },
        },
        required: ['playerScores', 'reasoning', 'winnerId'],
      },
    },
  });
  const data = JSON.parse(response.text || '{}');
  const scores = {};
  data.playerScores?.forEach((s) => {
    scores[s.playerId] = s.score;
  });
  return { scores, reasoning: data.reasoning || '', winnerId: data.winnerId || '' };
}

async function generateSubmission(ai, { imageA, imageB }) {
  const prompt = `Intersection of "${imageA.title}" and "${imageB.title}". Max 8 words. Be brilliant.`;
  const response = await ai.models.generateContent({ model: TEXT_MODEL, contents: prompt });
  return { text: response.text?.trim() || 'The perfect union.' };
}

async function visualize(ai, { imageA, imageB, winningText }) {
  const prompt = `A cinematic, high-definition artistic masterpiece. It is the perfect visual fusion of:
  - "${imageA.title}": ${imageA.description}
  - "${imageB.title}": ${imageB.description}
  The thematic bridge that unites them is: "${winningText}".
  Create an evocative image of this new combined entity. No text. Highly detailed.`;

  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: { parts: [{ text: prompt }] },
    config: { imageConfig: { aspectRatio: '1:1' } },
  });

  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData) return { image: `data:image/png;base64,${part.inlineData.data}` };
  }
  return { image: null };
}

async function announce(ai, { text }) {
  const response = await ai.models.generateContent({
    model: TTS_MODEL,
    contents: [{ parts: [{ text: `Announce this winner with high energy: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
      },
    },
  });
  const audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data ?? null;
  return { audio };
}

const ROUTES = {
  '/api/commentary': generateCommentary,
  '/api/label': generateLabel,
  '/api/moderate': moderateRound,
  '/api/submission': generateSubmission,
  '/api/visualize': visualize,
  '/api/announce': announce,
};

/**
 * Connect-style middleware handling the game's /api/* routes.
 * The Gemini API key stays on the server; the client only ever sees game data.
 */
export function createApiHandler(getApiKey) {
  let ai = null;

  return async (req, res, next) => {
    const url = (req.url || '').split('?')[0];
    const route = ROUTES[url];
    if (!route) {
      if (next) return next();
      return sendJson(res, 404, { error: 'Not found' });
    }
    if (req.method !== 'POST') {
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      return sendJson(res, 500, { error: 'GEMINI_API_KEY is not configured on the server' });
    }

    try {
      ai ??= new GoogleGenAI({ apiKey });
      const body = await readBody(req);
      const result = await route(ai, body);
      sendJson(res, 200, result);
    } catch (error) {
      console.error(`API error on ${url}:`, error);
      sendJson(res, 502, { error: error instanceof Error ? error.message : 'Upstream error' });
    }
  };
}
