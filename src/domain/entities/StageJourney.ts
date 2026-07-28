import type { CognitiveStage } from './CognitiveStage';

export type StageSentiment = 'positive' | 'neutral' | 'negative';

export type StageOutcome = 'succeeded' | 'blocked' | 'stopped';

export interface StageJourney {
  stage: CognitiveStage;
  description: string;
  sentiment: StageSentiment;
  outcome: StageOutcome;
  transition?: string;
}
