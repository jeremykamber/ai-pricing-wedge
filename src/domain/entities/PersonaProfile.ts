export interface PersonaProfile {
  name: string;
  occupation: string;
  bigFive: {
    conscientiousness: number;
    neuroticism: number;
    openness: number;
    extraversion: number;
    agreeableness: number;
  };
  values: string[];
  fears: string[];
  communicationStyle: string;
  decisionStyle: string;
}
