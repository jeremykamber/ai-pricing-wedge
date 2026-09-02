export type CognitiveStage =
  | 'interpretation'
  | 'understanding'
  | 'belief'
  | 'motivation'
  | 'action';

export const COGNITIVE_STAGES: CognitiveStage[] = [
  'interpretation',
  'understanding',
  'belief',
  'motivation',
  'action',
];

export const STAGE_LABELS: Record<CognitiveStage, string> = {
  interpretation: 'Interpretation',
  understanding: 'Understanding',
  belief: 'Belief',
  motivation: 'Motivation',
  action: 'Action',
};

export const STAGE_QUESTIONS: Record<CognitiveStage, string> = {
  interpretation: 'What do I think this is?',
  understanding: 'Do I understand it?',
  belief: 'Do I believe it?',
  motivation: 'Do I care enough?',
  action: 'What do I do?',
};
