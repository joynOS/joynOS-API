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
  if (
    cohortMemberEmbeddings &&
    cohortMemberEmbeddings.length &&
    userEmbedding
  ) {
    const scores = cohortMemberEmbeddings
      .map((emb) => (emb ? cosineSim(userEmbedding, emb) : 0))
      .filter((v) => typeof v === 'number');
    if (scores.length) {
      vibeMatchScoreWithOtherUsers = Math.round(
        100 * (scores.reduce((a, b) => a + b, 0) / scores.length),
      );
    }
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
