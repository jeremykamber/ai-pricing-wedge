"use server"

import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl"

export async function regenPersonaTraitsAction(backstory: string) {
  const llm = LlmServiceImpl.createFromEnv("openrouter")
  const traits = await llm.inferTraitsFromBackstory(backstory)
  return traits
}
