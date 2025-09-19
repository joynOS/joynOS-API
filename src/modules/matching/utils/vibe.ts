import { cosineSim } from './cosine';

export type InterestWeight = { interestId: string; weight: number };

export function calculateVibeScores(args: {
  userEmbedding?: Float32Array;
  eventEmbedding?: Float32Array;
  userInterests: InterestWeight[];
  eventInterests: InterestWeight[];
  distanceMiles?: number | null;
  radiusMiles: number;
  rating?: number | null;
  cohortMemberEmbeddings?: (Float32Array | undefined)[];
  cohortMemberInterests?: InterestWeight[][];
}) {
  const {
    userEmbedding,
    eventEmbedding,
    userInterests,
    eventInterests,
    distanceMiles,
    radiusMiles,
    rating,
    cohortMemberEmbeddings,
    cohortMemberInterests,
  } = args;

  const sumUser = userInterests.reduce((s, r) => s + (r.weight || 0), 0) || 1;
  const overlap =
    userInterests.reduce((s, ui) => {
      const ev = eventInterests.find((x) => x.interestId === ui.interestId);
      return s + Math.min(ui.weight || 0, ev?.weight || 0);
    }, 0) / sumUser;

  const cosine =
    userEmbedding && eventEmbedding
      ? cosineSim(userEmbedding, eventEmbedding)
      : 0;

  const penalty =
    typeof distanceMiles === 'number' && isFinite(distanceMiles)
      ? Math.max(0, Math.min(1, 1 - distanceMiles / (radiusMiles || 1)))
      : 0;
  const rate = Math.max(
    0,
    Math.min(1, ((rating ? Number(rating) : 0) - 4.0) / 1.0),
  );

  const vibeMatchScoreEvent = Math.round(
    100 * (0.35 * overlap + 0.35 * cosine + 0.15 * rate + 0.15 * penalty),
  );

  let vibeMatchScoreWithOtherUsers = 0;

  // First try embedding-based similarity if we have valid embeddings
  if (
    cohortMemberEmbeddings &&
    cohortMemberEmbeddings.length &&
    userEmbedding
  ) {
    const scores = cohortMemberEmbeddings
      .map((emb) => (emb ? cosineSim(userEmbedding, emb) : 0))
      .filter((v) => typeof v === 'number');

    if (scores.length > 0) {
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      vibeMatchScoreWithOtherUsers = Math.round(100 * avgScore);
    }
  }

  // If embeddings failed or returned 0, calculate compatibility based on interests
  if (vibeMatchScoreWithOtherUsers === 0 && cohortMemberInterests && cohortMemberInterests.length > 0) {
    vibeMatchScoreWithOtherUsers = calculateInterestBasedCompatibility(userInterests, cohortMemberInterests);
  }

  return {
    vibeMatchScoreEvent,
    vibeMatchScoreWithOtherUsers,
    overlap,
    cosine,
    penalty,
    rate,
  };
}

function calculateInterestBasedCompatibility(
  userInterests: InterestWeight[],
  cohortMemberInterests: InterestWeight[][]
): number {
  if (!cohortMemberInterests.length || !userInterests.length) {
    return 0;
  }

  // Calculate compatibility with each member based on shared interests
  const compatibilityScores = cohortMemberInterests.map(memberInterests => {
    if (!memberInterests.length) return 0;

    // Find overlap in interests
    let sharedWeight = 0;
    let totalUserWeight = userInterests.reduce((sum, interest) => sum + interest.weight, 0);
    let totalMemberWeight = memberInterests.reduce((sum, interest) => sum + interest.weight, 0);

    userInterests.forEach(userInterest => {
      const memberInterest = memberInterests.find(
        mi => mi.interestId === userInterest.interestId
      );
      if (memberInterest) {
        // Use minimum weight as shared compatibility
        sharedWeight += Math.min(userInterest.weight, memberInterest.weight);
      }
    });

    // Calculate percentage of compatibility
    const userNormalized = totalUserWeight > 0 ? sharedWeight / totalUserWeight : 0;
    const memberNormalized = totalMemberWeight > 0 ? sharedWeight / totalMemberWeight : 0;

    // Average of both normalized scores
    return (userNormalized + memberNormalized) / 2;
  });

  // Calculate average compatibility across all members
  const avgCompatibility = compatibilityScores.reduce((sum, score) => sum + score, 0) / compatibilityScores.length;

  // Convert to percentage score (0-100)
  return Math.round(avgCompatibility * 100);
}
