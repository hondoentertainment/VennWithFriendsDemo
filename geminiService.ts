
import { GoogleGenAI, Type } from "@google/genai";
import { ImageItem, Submission, AIModeratorVerdict } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });

export async function generateIntersectionLabel(image1: ImageItem, image2: ImageItem, submissions: Submission[]) {
  const prompt = `
    Two images are shown in a Venn diagram. 
    Image 1: ${image1.title} (${image1.tags.join(', ')})
    Image 2: ${image2.title} (${image2.tags.join(', ')})
    
    Players have submitted creative connections. Some are text, others are media links (images/videos/gifs).
    
    Submissions:
    ${submissions.map(s => `- Type: ${s.type}, Content: ${s.type === 'text' ? s.content : '[Visual Media Submitted]'}`).join('\n')}
    
    Tasks:
    1. Determine a concise, clever, and catching label for the "intersection" of these two images based on player inputs and visual analysis.
    2. Group the player submissions into 2-3 clusters based on similarity.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            intersectionLabel: { type: Type.STRING, description: "A catchy label for the intersection" },
            clusters: {
              type: Type.OBJECT,
              description: "Grouping submissions by ID",
              additionalProperties: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            }
          },
          required: ["intersectionLabel", "clusters"]
        }
      }
    });

    const json = JSON.parse(response.text || "{}");
    return json;
  } catch (error) {
    console.error("Gemini API error:", error);
    return { 
      intersectionLabel: "Creative Chaos", 
      clusters: { "Submissions": submissions.map(s => s.playerId) } 
    };
  }
}

export async function moderateSoloRound(
  image1: ImageItem, 
  image2: ImageItem, 
  submissions: Submission[],
  tone: 'serious' | 'funny' = 'funny'
): Promise<AIModeratorVerdict> {
  const toneInstruction = tone === 'funny' 
    ? "Be hilarious, witty, and slightly roasty. Use puns and sarcasm." 
    : "Be analytical, professional, and profound. Focus on the semiotics and deep connections.";

  const prompt = `
    You are an AI Game Moderator for "Venn with Friends". 
    ${toneInstruction}
    A human player is playing solo against AI bots.
    Image 1: ${image1.title}
    Image 2: ${image2.title}
    
    Evaluate these submissions. Assign a score from 0 to 10 for each based on creativity, wit, and how well it bridges the two images.
    
    Submissions:
    ${submissions.map(s => `[Player ID: ${s.playerId}] Type: ${s.type}, Content: ${s.type === 'text' ? s.content : '[Visual Media]'}`).join('\n')}
    
    Return the scores for each Player ID, a brief reasoning for the winner (matching your assigned tone), and identify the winner.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            scores: {
              type: Type.OBJECT,
              description: "Mapping of PlayerID to score 0-10",
              additionalProperties: { type: Type.NUMBER }
            },
            reasoning: { type: Type.STRING, description: "Reasoning for the choice based on tone" },
            winnerId: { type: Type.STRING, description: "The PlayerID of the winner" }
          },
          required: ["scores", "reasoning", "winnerId"]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Moderator Error:", error);
    return {
      scores: submissions.reduce((acc, s) => ({ ...acc, [s.playerId]: 5 }), {}),
      reasoning: "The algorithm suggests everything is perfectly balanced.",
      winnerId: submissions[0]?.playerId || ""
    };
  }
}

export async function generateAISubmission(image1: ImageItem, image2: ImageItem) {
  const prompt = `
    Find a clever creative intersection between these two images:
    Image 1: ${image1.title}
    Image 2: ${image2.title}
    
    Provide a single witty phrase (max 10 words) that describes what's in the middle.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text?.trim() || "The perfect mix.";
  } catch (error) {
    return "Something in between!";
  }
}

export async function searchGifs(query: string): Promise<string[]> {
  const prompt = `Search for exactly 6 high-quality animated GIFs that match the mood: "${query}". 
  Provide direct media URLs ending in .gif or direct Giphy/Tenor media links.
  Only return a JSON array of strings containing the URLs. 
  Example: ["https://media.giphy.com/media/xxx/giphy.gif", ...]`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      },
    });

    const urls: string[] = JSON.parse(response.text || "[]");
    
    // Supplement with grounding metadata if search yielded better links
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    chunks.forEach(chunk => {
      const uri = chunk.web?.uri;
      if (uri && (uri.includes('giphy.com') || uri.includes('tenor.com')) && !urls.includes(uri)) {
        urls.push(uri);
      }
    });

    // Transform Giphy landing pages to direct gif links if possible
    return urls.map(url => {
      if (url.includes('giphy.com/gifs/')) {
        const id = url.split('-').pop()?.split('/').pop();
        if (id) return `https://media.giphy.com/media/${id}/giphy.gif`;
      }
      return url;
    }).slice(0, 10);
  } catch (error) {
    console.error("GIF Search Error:", error);
    return [];
  }
}
