/**
 * Lightweight display projection of a Persona, embedded in PersonaResponse.
 * Carries only the fields shown on the results page — avoids pulling the full
 * 30-field Persona entity (backstory, provenance, PB&J rationales, etc.)
 * into every saved response.
 */
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
