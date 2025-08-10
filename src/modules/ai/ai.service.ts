import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class AIService {
  private readonly gen = new GoogleGenerativeAI(
    process.env.GEMINI_API_KEY as string,
  );
  private readonly modelText = this.gen.getGenerativeModel({
    model: 'gemini-1.5-flash',
  });

  private parseJson<T>(raw: string): T {
    let text = raw.trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```json\n?/i, '').replace(/^```\n?/, '');
      if (text.endsWith('```')) text = text.slice(0, -3);
    }
    text = text.trim();
    try {
      return JSON.parse(text);
    } catch {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        const sliced = text.slice(start, end + 1);
        return JSON.parse(sliced);
      }
      throw new Error('Failed to parse JSON from model output');
    }
  }

  async embed(text: string): Promise<number[]> {
    const embModel = this.gen.getGenerativeModel({
      model: 'text-embedding-004',
    });
    const r = await (embModel as any).embedContent(text);
    return (r.embedding.values as number[]) || [];
  }

  async normalizeEvent(input: {
    title: string;
    description?: string;
    venue?: string;
    tags?: string[];
  }): Promise<{
    categories: string[];
    tags: string[];
    mappedInterests: { id: string; weight: number }[];
    rationale: string;
  }> {
    const prompt = `Return strictly JSON. Map this event to our taxonomy.\nSchema:\n{ "categories": string[], "tags": string[], "mappedInterests": [{"id": string, "weight": number}], "rationale": string }\nTaxonomy slugs: ["jazz-music","live-music","theater","art-galleries","wine-tasting","food-tours","museums","gaming","karaoke","games","running","hiking","photography","meditation","travel","comedy-shows","beach-days","cooking","gardening"].\n\nEvent:\ntitle: ${input.title}\ndesc: ${input.description ?? ''}\nvenue: ${input.venue ?? ''}\ntags: ${JSON.stringify(input.tags ?? [])}`;
    const out = await this.modelText.generateContent(prompt);
    return this.parseJson(out.response.text());
  }

  async buildTwoPlans(input: {
    title: string;
    venue?: string;
    address?: string;
    start?: string;
  }): Promise<Array<{ title: string; description: string; emoji?: string }>> {
    const prompt = `Return strictly JSON array of 2 plans.\nEach: { "title": string, "description": string, "emoji": string }\nEvent: ${input.title} at ${input.venue ?? 'TBA'} (${input.address ?? ''}) start ${input.start ?? 'TBA'}.\nPlans should be distinct, actionable, time-bound and feasible in NYC.`;
    const out = await this.modelText.generateContent(prompt);
    return this.parseJson(out.response.text());
  }
}
