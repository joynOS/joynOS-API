export interface AIProvider {
  generateContent(prompt: string): Promise<string>;
  generateStructuredContent<T>(prompt: string, schema?: any): Promise<T>;
}

export interface BuildPlansRequest {
  title: string;
  venue?: string;
  address?: string;
  start?: string;
}

export interface BuildPlansResponse {
  title: string;
  description: string;
  emoji: string;
}

export interface AnalyzeVibeRequest {
  regionName: string;
  venues: Array<{
    name: string;
    address: string;
    types: string[];
    tags?: string[];
    rating: number;
    priceLevel: number;
  }>;
}

export interface AnalyzeVibeResponse {
  vibeKey: string;
  description: string;
  reasoning: string;
}

export interface AnalyzePlanVibesRequest {
  eventTitle: string;
  regionName: string;
  plans: BuildPlansResponse[];
  venues: Array<{
    name: string;
    address: string;
    types: string[];
    rating: number;
    priceLevel: number;
  }>;
}

export interface AnalyzePlanVibesResponse {
  overallEventVibe: string;
  plan1Analysis: string;
  plan2Analysis: string;
}