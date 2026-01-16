
import { GoogleGenAI, Type } from "@google/genai";
import { ImageItem, Submission } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });

export async function generateIntersectionLabel(image1: ImageItem, image2: ImageItem, submissions: Submission[]) {
  const prompt = `
    Two images are shown in a Venn diagram. 
    Image 1: ${image1.title} (${image1.tags.join(', ')})
    Image 2: ${image2.title} (${image2.tags.join(', ')})
    
    Players have submitted these creative intersections:
    ${submissions.map(s => `- ${s.content}`).join('\n')}
    
    Tasks:
    1. Determine a concise, clever, and catchy label for the "intersection" of these two images based on player inputs and visual analysis.
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
