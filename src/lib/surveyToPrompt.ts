import { z } from "zod";

export const GOAL_OPTIONS = [
  "Save time",
  "Reduce costs",
  "Grow revenue",
  "Find a job",
  "Improve productivity",
  "Stay compliant",
  "Learn a skill",
  "Something else",
] as const;

export const FRUSTRATION_OPTIONS = [
  "Too much manual work",
  "Information is hard to find",
  "Existing tools are confusing",
  "Too expensive",
  "Takes too long",
  "Hard to trust solutions",
  "Other",
] as const;

export const SOLUTION_OPTIONS = [
  "Spreadsheet",
  "Existing software",
  "Agency",
  "Internal process",
  "Do not solve it",
  "Other",
] as const;

export const DECISION_FACTOR_OPTIONS = [
  "Price",
  "Ease of use",
  "Speed",
  "Accuracy",
  "Brand trust",
  "Integrations",
  "Customer support",
  "Recommendations",
  "Features",
] as const;

export const AUDIENCE_KNOWLEDGE_OPTIONS = [
  "I have interviewed many of them",
  "I have talked to a few",
  "Mostly based on my experience",
  "Mostly assumptions",
] as const;

export const DECISION_TYPE_OPTIONS = [
  "Landing pages",
  "Pricing",
  "Product features",
  "Messaging",
  "Onboarding",
  "Customer interviews",
  "Sales conversations",
  "General research",
] as const;

export const PersonaSurveySchema = z.object({
  targetAudience: z.string().min(1, "Target audience is required"),
  goals: z.array(z.string()).min(1).max(5),
  frustration: z.string().min(1),
  currentSolution: z.string().min(1),
  decisionFactors: z.array(z.string()).min(1),
  audienceKnowledge: z.string().min(1),
  decisionTypes: z.array(z.string()).min(1),
  additionalNotes: z.string().optional(),
});

export type PersonaSurvey = z.infer<typeof PersonaSurveySchema>;

const CONFIDENCE_MAP: Record<string, string> = {
  "I have interviewed many of them": "HIGH - based on direct research with this audience",
  "I have talked to a few": "MEDIUM-HIGH - based on some direct conversations",
  "Mostly based on my experience": "MEDIUM - based on experience, not direct research",
  "Mostly assumptions": "LOWER - more assumptions than direct evidence",
};

export function surveyToPrompt(survey: PersonaSurvey): string {
  const confidence = CONFIDENCE_MAP[survey.audienceKnowledge] ?? "MEDIUM";

  return [
    `Target audience: ${survey.targetAudience}`,
    `Goals they are trying to accomplish: ${survey.goals.join(", ")}`,
    `Biggest frustration: ${survey.frustration}`,
    `Current solution: ${survey.currentSolution}`,
    `Top factors when choosing a product: ${survey.decisionFactors.join(", ")}`,
    `Audience knowledge confidence: ${confidence}`,
    `Primary decisions to model: ${survey.decisionTypes.join(", ")}`,
    survey.additionalNotes ? `Additional context: ${survey.additionalNotes}` : "",
  ]
    .filter(Boolean)
    // Blank line between sections — the question-attribution mapping
    // (evidenceQuestionsFor) splits on blank lines, and the LLM sees clearer
    // structure too. (filter(Boolean) only drops the optional empty tail.)
    .join("\n\n");
}
