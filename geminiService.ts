import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ImageItem, Submission, AIModeratorVerdict } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Audio Helper: Decode Raw PCM from Gemini TTS
async function playRawAudio(base64Data: string) {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
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
    console.error("Audio playback failed", e);
  }
}

export async function announceWinner(verdict: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Announce this winner with high energy: ${verdict}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
      },
    });
    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (audioData) await playRawAudio(audioData);
  } catch (e) {
    console.error("TTS generation failed", e);
  }
}

export async function fetchTrendingTopics() {
  const prompt = `Search for the top 5 most visually striking trending topics in pop culture or nature today. 
  For each topic, provide a short name, an emoji, and 3 high-quality Unsplash image keywords.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              icon: { type: Type.STRING },
              keywords: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["name", "icon", "keywords"]
          }
        }
      }
    });
    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Trending topics error:", error);
    return [];
  }
}

export async function visualizeIntersection(image1: ImageItem, image2: ImageItem, winningText: string) {
  const prompt = `A cinematic, high-definition artistic masterpiece. It is the perfect visual fusion of:
  - "${image1.title}": ${image1.description}
  - "${image2.title}": ${image2.description}
  The thematic bridge that unites them is: "${winningText}".
  Create an evocative image of this new combined entity. No text. Highly detailed.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: prompt }] },
      config: { imageConfig: { aspectRatio: "1:1" } },
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    return null;
  } catch (error) {
    console.error("Visualizer error:", error);
    return null;
  }
}

export async function getLiveCommentary(image1: ImageItem, image2: ImageItem, submissions: Submission[]) {
  const prompt = `Context: Players are finding connections between "${image1.title}" and "${image2.title}".
  Submissions so far: ${submissions.map(s => s.content).join(", ")}.
  Provide a witty, one-sentence "AI Hype" observation (max 12 words).`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text?.trim() || "Things are getting interesting...";
  } catch (e) { return "The fusion is imminent!"; }
}

export async function generateIntersectionLabel(image1: ImageItem, image2: ImageItem, submissions: Submission[]) {
  const prompt = `Analyze assets "${image1.title}" and "${image2.title}" plus these submissions: ${submissions.map(s => s.content).join(", ")}.
  Give the intersection a single punchy Name (e.g. "Cyber-Forest").`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { intersectionLabel: { type: Type.STRING } },
          required: ["intersectionLabel"]
        }
      }
    });
    return JSON.parse(response.text || '{"intersectionLabel": "The Void"}');
  } catch (e) { return { intersectionLabel: "Fusion Point" }; }
}

export async function moderateSoloRound(image1: ImageItem, image2: ImageItem, submissions: Submission[], tone: 'serious' | 'funny' = 'funny'): Promise<AIModeratorVerdict> {
  const prompt = `MODERATOR: Evaluate which submission best bridges "${image1.title}" and "${image2.title}".
  Tone: ${tone}.
  Submissions: ${submissions.map(s => `[${s.playerId}] ${s.content}`).join('\n')}
  Output JSON scores (0-10) for everyone and pick the winnerId.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            playerScores: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { playerId: { type: Type.STRING }, score: { type: Type.NUMBER } } } },
            reasoning: { type: Type.STRING },
            winnerId: { type: Type.STRING }
          }
        }
      }
    });
    const data = JSON.parse(response.text || "{}");
    const scores: Record<string, number> = {};
    data.playerScores?.forEach((s: any) => { scores[s.playerId] = s.score; });
    return { scores, reasoning: data.reasoning, winnerId: data.winnerId };
  } catch (e) {
    return { scores: {}, reasoning: "You are all creative!", winnerId: submissions[0]?.playerId || "" };
  }
}

export async function generateAISubmission(image1: ImageItem, image2: ImageItem) {
  const prompt = `Intersection of "${image1.title}" and "${image2.title}". Max 8 words. Be brilliant.`;
  const response = await ai.models.generateContent({ model: "gemini-3-flash-preview", contents: prompt });
  return response.text?.trim() || "The perfect union.";
}

export async function searchGifs(query: string): Promise<string[]> {
  const prompt = `Find 6 GIF URLs for: "${query}". Return JSON array.`;
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: { tools: [{ googleSearch: {} }], responseMimeType: "application/json" }
  });
  return JSON.parse(response.text || "[]");
}