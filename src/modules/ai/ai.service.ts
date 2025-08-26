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
    const venue1Details = input.venues[0]
      ? `${input.venues[0].name} (${input.venues[0].types.join(', ')}) - Rating: ${input.venues[0].rating}/5 - Price: ${'$'.repeat(input.venues[0].priceLevel || 1)}`
      : 'Venue details not available';
    const venue2Details = input.venues[1]
      ? `${input.venues[1].name} (${input.venues[1].types.join(', ')}) - Rating: ${input.venues[1].rating}/5 - Price: ${'$'.repeat(input.venues[1].priceLevel || 1)}`
      : 'Venue details not available';

    const prompt = `You are analyzing TWO DIFFERENT event plan options. Each plan centers around a specific venue/experience. Your job is to describe what makes each plan's SPECIFIC EXPERIENCE unique and exciting.

CRITICAL: Do NOT describe the general area or neighborhood. Focus ONLY on what participants will experience with each individual plan option.

EVENT: ${input.eventTitle} in ${input.regionName}

=== PLAN 1 ANALYSIS ===
PLAN: ${plan1.title}
DESCRIPTION: ${plan1.description}
PRIMARY VENUE: ${venue1Details}

=== PLAN 2 ANALYSIS ===  
PLAN: ${plan2.title}
DESCRIPTION: ${plan2.description}
PRIMARY VENUE: ${venue2Details}

Return strictly JSON:
{
  "plan1Analysis": {
    "vibeKey": "SPECIFIC_VIBE",
    "description": "Specific description of what participants will DO and EXPERIENCE with this exact plan option. Focus on activities, atmosphere, and unique elements of this plan's venue/experience.",
    "whyThisVibe": "Why this specific vibe matches what participants will experience in this particular plan",
    "expectedExperience": "Detailed walkthrough of what someone choosing this plan will actually do, see, taste, feel - be very specific to this plan's activities and venue"
  },
  "plan2Analysis": {
    "vibeKey": "SPECIFIC_VIBE",
    "description": "Specific description of what participants will DO and EXPERIENCE with this different plan option. Focus on how this plan's activities and venue create a different experience from plan 1.", 
    "whyThisVibe": "Why this specific vibe matches what participants will experience in this particular plan",
    "expectedExperience": "Detailed walkthrough of what someone choosing this plan will actually do, see, taste, feel - be very specific to this plan's activities and venue"
  },
  "overallEventVibe": "Brief 1-2 sentence summary highlighting that this event offers two distinct experiences/vibes to choose from"
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

IMPORTANT RULES:
1. Each plan analysis must be about that specific plan's experience, NOT the general area
2. Use concrete details from the plan description and venue information
3. Make the two plans clearly different from each other
4. Focus on activities, atmosphere, and what people will actually do`;

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
    const plan1Venue = input.nearbyVenues[0] || {
      name: input.venue,
      types: ['venue'],
      rating: 4,
      priceLevel: 2,
    };
    const plan2Venue = input.nearbyVenues[1] ||
      input.nearbyVenues[0] || {
        name: input.venue,
        types: ['venue'],
        rating: 4,
        priceLevel: 2,
      };

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

    const prompt = `Create enhanced plan descriptions that focus on the SPECIFIC experience each individual plan offers. Each plan should feel like a completely different experience.

CRITICAL: Do NOT describe the general area/neighborhood. Focus ONLY on what makes each plan's experience unique and exciting.

EVENT: ${input.eventTitle} in ${input.regionName}
TIME FRAME: ${eventStartTime} - ${eventEndTime}

=== PLAN 1 ENHANCEMENT ===
PLAN TITLE: ${input.plans[0]?.title}
CURRENT DESCRIPTION: ${input.plans[0]?.description}
PRIMARY VENUE: ${plan1Venue.name} (${plan1Venue.types.join(', ')}) - ${plan1Venue.rating}/5 stars

=== PLAN 2 ENHANCEMENT ===
PLAN TITLE: ${input.plans[1]?.title}  
CURRENT DESCRIPTION: ${input.plans[1]?.description}
PRIMARY VENUE: ${plan2Venue.name} (${plan2Venue.types.join(', ')}) - ${plan2Venue.rating}/5 stars

Return strictly JSON array with 2 enhanced plans:
[
  {
    "title": "Enhanced catchy title that captures this specific plan's unique appeal",
    "description": "Concise one-line description focusing on this plan's main appeal", 
    "detailedDescription": "Rich 3-4 sentence description focusing ONLY on what participants will experience with THIS specific plan. Include sensory details, specific activities, and what makes this plan choice special. Mention the primary venue by name and what makes it unique.",
    "timeline": "Detailed timeline from ${eventStartTime} to ${eventEndTime}, broken into 3-4 time segments showing the progression of this specific plan's activities. Use real times and be specific about what happens when.",
    "vibe": "One word describing this specific plan's energy/mood",
    "highlights": ["Specific unique aspect 1 of this plan", "Specific unique aspect 2 of this plan", "Specific unique aspect 3 of this plan"],
    "emoji": "emoji that matches this specific plan's vibe"
  }
]

IMPORTANT RULES:
1. Each plan description must be about that SPECIFIC plan experience, not general area info
2. Use the primary venue name and details for each plan
3. Make the two plans sound completely different from each other
4. Include specific activities, atmosphere, and sensory details for each plan
5. Timelines should show different activity progressions for each plan
6. Highlights should be plan-specific, not generic location features

Focus on what someone choosing Plan 1 will do vs what someone choosing Plan 2 will do - they should sound like completely different experiences.`;

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
