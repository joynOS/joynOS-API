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

  async analyzeEventVibe(input: {
    regionName: string;
    venues: Array<{
      name: string;
      address: string;
      types: string[];
      tags: string[];
      rating?: number;
      priceLevel?: number;
    }>;
  }): Promise<{
    vibeKey: string;
    vibeAnalysis: string;
    mappedInterests: { id: string; weight: number }[];
  }> {
    const venueList = input.venues
      .map(
        (v) =>
          `${v.name} (${v.address}) - Types: ${v.types.join(', ')} - Tags: ${v.tags.join(', ')} - Rating: ${v.rating || 'N/A'}`,
      )
      .join('\n');

    const prompt = `Analyze this region and its venues to determine the vibe and interests.

REGION: ${input.regionName}
VENUES:
${venueList}

Return strictly JSON:
{
  "vibeKey": "RELAXED",
  "vibeAnalysis": "2-3 sentence description of the area's atmosphere and what kind of experience people can expect",
  "mappedInterests": [{"id": "slug", "weight": 1-5}]
}

IMPORTANT: vibeKey must be EXACTLY ONE of these values:
- RELAXED
- DATE_NIGHT  
- PARTY
- ARTSY
- MORNING
- CHILL
- SOCIAL
- CULTURAL

Choose the SINGLE most dominant vibe based on the venues. Do not combine multiple vibes.

Available interest slugs: ["jazz-music","live-music","theater","art-galleries","wine-tasting","food-tours","museums","gaming","karaoke","games","running","hiking","photography","meditation","travel","comedy-shows","beach-days","cooking","gardening"]

Base the vibeKey on the actual venue types and atmosphere. Base mappedInterests on what activities are most supported by these venues.`;

    const out = await this.modelText.generateContent(prompt);
    return this.parseJson(out.response.text());
  }

  async analyzePlanVibes(input: {
    eventTitle: string;
    regionName: string;
    plans: Array<{
      title: string;
      description: string;
      emoji?: string;
    }>;
    venues: Array<{
      name: string;
      address: string;
      types: string[];
      rating?: number;
      priceLevel?: number;
    }>;
  }): Promise<{
    plan1Analysis: {
      vibeKey: string;
      description: string;
      whyThisVibe: string;
      expectedExperience: string;
    };
    plan2Analysis: {
      vibeKey: string;
      description: string;
      whyThisVibe: string;
      expectedExperience: string;
    };
    overallEventVibe: string;
  }> {
    const plan1 = input.plans[0];
    const plan2 = input.plans[1];
    const venueDetails = input.venues
      .map(
        (v) =>
          `${v.name} (${v.types.join(', ')}) - Rating: ${v.rating}/5 - Price: ${'$'.repeat(v.priceLevel || 1)}`,
      )
      .join(', ');

    const prompt = `Analyze these two event plan options and describe what makes each unique. Focus on the specific experience each plan offers.

EVENT: ${input.eventTitle} in ${input.regionName}
VENUES: ${venueDetails}

PLAN 1: ${plan1.title}
${plan1.description}

PLAN 2: ${plan2.title} 
${plan2.description}

Return strictly JSON:
{
  "plan1Analysis": {
    "vibeKey": "SPECIFIC_VIBE",
    "description": "What makes this plan special and different from plan 2",
    "whyThisVibe": "Why this vibe fits this specific plan",
    "expectedExperience": "What participants will actually do and feel"
  },
  "plan2Analysis": {
    "vibeKey": "SPECIFIC_VIBE", 
    "description": "What makes this plan special and different from plan 1",
    "whyThisVibe": "Why this vibe fits this specific plan",
    "expectedExperience": "What participants will actually do and feel"
  },
  "overallEventVibe": "Brief summary of what this event location offers"
}

Available vibes:
- RELAXED (wellness, spa, chill activities)
- DATE_NIGHT (romantic, wine tasting, intimate dining)  
- PARTY (nightlife, dancing, celebrations)
- ARTSY (galleries, creative workshops, art shows)
- MORNING (breakfast, coffee, early activities)
- CHILL (casual, laid-back, easy-going)
- SOCIAL (networking, meetups, community events)
- CULTURAL (museums, theater, classical events)

Make each plan analysis unique and specific to what that plan offers. Avoid generic area descriptions.`;

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

  async enhancePlanDescriptions(input: {
    eventTitle: string;
    regionName: string;
    venue: string;
    address: string;
    startTime?: Date;
    endTime?: Date;
    plans: Array<{
      title: string;
      description: string;
      emoji?: string;
    }>;
    nearbyVenues: Array<{
      name: string;
      types: string[];
      rating?: number;
      priceLevel?: number;
    }>;
  }): Promise<
    Array<{
      title: string;
      description: string;
      detailedDescription: string;
      timeline: string;
      vibe: string;
      highlights: string[];
      emoji?: string;
    }>
  > {
    const venueContext = input.nearbyVenues
      .map((v) => `${v.name} (${v.types.join(', ')}) - ${v.rating}/5 stars`)
      .join(', ');

    const eventStartTime = input.startTime
      ? input.startTime.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      : '7:00 PM';

    const eventEndTime = input.endTime
      ? input.endTime.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      : '10:00 PM';

    const prompt = `Enhance these event plan descriptions with rich, specific details that help people visualize the experience.

EVENT: ${input.eventTitle}
LOCATION: ${input.venue}, ${input.address} in ${input.regionName}
SCHEDULED TIME: ${eventStartTime} - ${eventEndTime}
NEARBY VENUES: ${venueContext}

PLAN 1: ${input.plans[0]?.title}
${input.plans[0]?.description}

PLAN 2: ${input.plans[1]?.title}
${input.plans[1]?.description}

Return strictly JSON array with 2 enhanced plans:
[
  {
    "title": "Enhanced catchy title",
    "description": "Original concise description", 
    "detailedDescription": "Rich 3-4 sentence description with specific details about what you'll do, see, taste, or experience",
    "timeline": "Timeline using actual event times from ${eventStartTime} to ${eventEndTime}, broken into 2-3 time segments showing progression of activities",
    "vibe": "One word describing the energy/mood",
    "highlights": ["Key experience 1", "Key experience 2", "Key experience 3"],
    "emoji": "relevant emoji"
  }
]

Make descriptions vivid and specific. Include sensory details, actual activities, and what makes each plan unique. Reference the specific location and nearby venues when relevant. 

IMPORTANT: Use the actual scheduled event time (${eventStartTime} - ${eventEndTime}) in your timeline, not generic placeholder times. Break the event duration into logical segments.`;

    const out = await this.modelText.generateContent(prompt);
    return this.parseJson(out.response.text());
  }

  async analyzeExternalEvent(input: {
    title: string;
    description?: string;
    venue?: string;
    address?: string;
    categories?: string[];
    source: string;
    organizerName?: string;
  }): Promise<{
    vibeKey: string;
    interests: { id: string; weight: number }[];
    regionName?: string;
  }> {
    const prompt = `Analyze this external event and return JSON with vibeKey, interests array, and regionName.

Event Details:
- Title: ${input.title}
- Description: ${input.description || 'N/A'}
- Venue: ${input.venue || 'N/A'} 
- Address: ${input.address || 'N/A'}
- Categories: ${input.categories?.join(', ') || 'N/A'}
- Source: ${input.source}
- Organizer: ${input.organizerName || 'N/A'}

Available vibes (choose exactly ONE):
- RELAXED (wellness, spa, chill activities)
- DATE_NIGHT (romantic, wine tasting, intimate dining)
- PARTY (nightlife, dancing, celebrations)
- ARTSY (galleries, creative workshops, art shows)
- MORNING (breakfast, coffee, early activities)
- CHILL (casual, laid-back, easy-going)
- SOCIAL (networking, meetups, community events)
- CULTURAL (museums, theater, classical events)

Available interest slugs: ["jazz-music","live-music","theater","art-galleries","wine-tasting","food-tours","museums","gaming","karaoke","games","running","hiking","photography","meditation","travel","comedy-shows","beach-days","cooking","gardening"]

Extract regionName from address (neighborhood/area name like "SoHo", "Brooklyn", "Manhattan").

Return JSON:
{
  "vibeKey": "MOST_APPROPRIATE_VIBE",
  "interests": [{"id": "interest-slug", "weight": 1-5}],
  "regionName": "neighborhood/area name"
}`;

    const out = await this.modelText.generateContent(prompt);
    return this.parseJson(out.response.text());
  }

  async optimizeDiscoveryPhotos(input: {
    eventTitle: string;
    regionName: string;
    vibeKey: string;
    availablePhotos: Array<{
      url: string;
      width: number;
      height: number;
      attributions?: string[];
    }>;
  }): Promise<{
    primaryPhoto: string;
    galleryPhotos: string[];
    photoDescriptions: string[];
    visualVibe: string;
  }> {
    const photoList = input.availablePhotos
      .map(
        (photo, idx) =>
          `Photo ${idx + 1}: ${photo.width}x${photo.height} - ${photo.url}`,
      )
      .join('\n');

    const prompt = `Optimize photo selection for this discovery card to create maximum visual appeal and match the vibe.

EVENT: ${input.eventTitle} in ${input.regionName}
VIBE: ${input.vibeKey}
AVAILABLE PHOTOS:
${photoList}

Return strictly JSON:
{
  "primaryPhoto": "URL of best hero image that captures the essence",
  "galleryPhotos": ["3-4 URLs for scrollable gallery showing variety"],
  "photoDescriptions": ["Brief description of what each gallery photo shows"],
  "visualVibe": "One word describing the overall visual aesthetic"
}

Selection criteria:
- Primary photo should be highest quality and most representative
- Gallery should show different aspects (ambiance, food, people, details)
- Prioritize photos that evoke the ${input.vibeKey.toLowerCase()} vibe
- Choose diverse compositions (wide shots, close-ups, lifestyle moments)
- Avoid repetitive or low-quality images`;

    const out = await this.modelText.generateContent(prompt);
    return this.parseJson(out.response.text());
  }

  async generateDiscoveryCardContent(input: {
    eventTitle: string;
    regionName: string;
    vibeKey: string;
    plans: Array<{
      title: string;
      description: string;
      vibe?: string;
      highlights?: string[];
    }>;
    venues: Array<{
      name: string;
      types: string[];
      rating?: number;
      priceLevel?: number;
    }>;
  }): Promise<{
    tagline: string;
    hookDescription: string;
    quickStats: {
      duration: string;
      vibe: string;
      priceRange: string;
      groupSize: string;
    };
    whyThisEvent: string[];
    socialProof: string;
  }> {
    const venueInfo = input.venues
      .map((v) => `${v.name} (${v.types.join(', ')}) - ${v.rating}/5 stars`)
      .join(', ');

    const prompt = `Create compelling discovery card content that makes people want to join this event.

EVENT: ${input.eventTitle}
LOCATION: ${input.regionName}
VIBE: ${input.vibeKey}
VENUES: ${venueInfo}

PLAN 1: ${input.plans[0]?.title} - ${input.plans[0]?.description}
PLAN 2: ${input.plans[1]?.title} - ${input.plans[1]?.description}

Return strictly JSON:
{
  "tagline": "Catchy 5-7 word tagline that captures the essence",
  "hookDescription": "2-sentence description that creates FOMO and excitement",
  "quickStats": {
    "duration": "2-3 hours",
    "vibe": "${input.vibeKey.toLowerCase().replace('_', ' ')}",
    "priceRange": "$$", 
    "groupSize": "4-6 people"
  },
  "whyThisEvent": ["Reason 1", "Reason 2", "Reason 3"],
  "socialProof": "What type of people love this experience"
}

Make content engaging, specific, and focused on the unique experience. Avoid generic descriptions.`;

    const out = await this.modelText.generateContent(prompt);
    return this.parseJson(out.response.text());
  }

  async generateRealisticUserGroup(input: {
    eventTitle: string;
    vibeKey: string;
    regionName: string;
    groupSize: number;
  }): Promise<
    Array<{
      name: string;
      age: number;
      profession: string;
      interests: string[];
      personality: string;
      whyJoining: string;
      avatar: {
        description: string;
        style: string;
        ethnicity: string;
        hairColor: string;
        outfit: string;
      };
    }>
  > {
    const prompt = `Generate ${input.groupSize} diverse, realistic users who would join this event. Create a balanced group that feels authentic for NYC.

EVENT: ${input.eventTitle} in ${input.regionName}
VIBE: ${input.vibeKey}

Return strictly JSON array of ${input.groupSize} users:
[
  {
    "name": "First name only",
    "age": 22-35,
    "profession": "realistic NYC job",
    "interests": ["interest1", "interest2", "interest3"],
    "personality": "One sentence describing their vibe",
    "whyJoining": "Why they're excited about this specific event",
    "avatar": {
      "description": "Physical description for avatar generation",
      "style": "fashion/aesthetic style",
      "ethnicity": "diverse representation",
      "hairColor": "natural color",
      "outfit": "appropriate for event vibe"
    }
  }
]

Requirements:
- Prioritize women (3-4 out of ${input.groupSize})
- Include diverse ethnicities and backgrounds
- Make personalities unique and interesting
- Ensure interests align with event vibe
- Create realistic NYC professionals (creative, tech, finance, etc.)
- Make "whyJoining" specific to the event, not generic`;

    const out = await this.modelText.generateContent(prompt);
    return this.parseJson(out.response.text());
  }

  async generateVotingScenario(input: {
    eventTitle: string;
    plans: Array<{
      title: string;
      description: string;
      vibe?: string;
    }>;
    users: Array<{
      name: string;
      personality: string;
      interests: string[];
    }>;
  }): Promise<{
    votingResults: Array<{
      userName: string;
      chosenPlan: number;
      reasoning: string;
      enthusiasm: number;
    }>;
    chatPreviews: Array<{
      userName: string;
      message: string;
      timestamp: string;
    }>;
    votingInsights: {
      frontrunner: number;
      closenessDescription: string;
      groupDynamic: string;
    };
  }> {
    const userList = input.users
      .map(
        (u) =>
          `${u.name}: ${u.personality} (interests: ${u.interests.join(', ')})`,
      )
      .join('\n');

    const prompt = `Simulate realistic voting behavior for this event's plans.

EVENT: ${input.eventTitle}

PLAN 1: ${input.plans[0]?.title}
${input.plans[0]?.description}

PLAN 2: ${input.plans[1]?.title}  
${input.plans[1]?.description}

USERS:
${userList}

Return strictly JSON:
{
  "votingResults": [
    {
      "userName": "name",
      "chosenPlan": 1 or 2,
      "reasoning": "Why they chose this plan based on their personality",
      "enthusiasm": 1-5
    }
  ],
  "chatPreviews": [
    {
      "userName": "name",
      "message": "Natural chat message about their choice or excitement", 
      "timestamp": "relative time like '2m ago'"
    }
  ],
  "votingInsights": {
    "frontrunner": 1 or 2,
    "closenessDescription": "How close the vote is",
    "groupDynamic": "Brief description of group energy/vibe"
  }
}

Make votes feel authentic based on personalities. Include some friendly discussion in chat.`;

    const out = await this.modelText.generateContent(prompt);
    return this.parseJson(out.response.text());
  }
}
