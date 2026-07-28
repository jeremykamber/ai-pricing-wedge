#!/usr/bin/env tsx

import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// Debug: Check env vars
const openrouterKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
console.log("API Key check:", {
  hasKey: !!openrouterKey,
  keyPrefix: openrouterKey?.slice(0, 15),
  keyLength: openrouterKey?.length,
});

import { GeneratePersonasUseCase } from "@/application/usecases/GeneratePersonasUseCase";
import { AnalyzeArtifactUseCase } from "@/application/usecases/AnalyzeArtifactUseCase";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";
import { RemotePlaywrightAdapter } from "@/infrastructure/adapters/RemotePlaywrightAdapter";
import { Persona } from "@/domain/entities/Persona";

const DEFAULT_URL = "https://linear.app/pricing";
const DEFAULT_PERSONA_DESCRIPTION = "B2B SaaS pricing page users";

export interface BenchmarkFlags {
  personasOnly: boolean;
  useMockPersonas: boolean;
  url: string;
}

export function parseArgs(): BenchmarkFlags {
  const args = process.argv.slice(2);
  return {
    personasOnly: args.includes("--personas-only"),
    useMockPersonas: args.includes("--use-mock-personas"),
    url: args.find(a => a.startsWith("--url="))?.split("=")[1] || DEFAULT_URL,
  };
}

export function formatTime(ms: number): string {
  return `${(ms / 1000).toFixed(3)}s`;
}

export function createMockPersonas(): Persona[] {
  return [
    {
      id: "mock-1",
      name: "Alice Chen",
      age: 32,
      occupation: "Product Manager",
      educationLevel: "MBA",
      interests: ["Productivity tools", "Data analysis"],
      goals: ["Scale team efficiency", "Reduce costs"],
      conscientiousness: 80,
      neuroticism: 30,
      openness: 65,
      extraversion: 55,
      agreeableness: 70,
      values: ["Efficiency", "Data-driven decisions", "Transparency"],
      fears: ["Wasting budget", "Tools that don't deliver ROI"],
      communicationStyle: "Direct and analytical",
      decisionStyle: "Data-driven",
      pricingSensitivity: 60,
      typicalBudget: "Up to $20/user/month",
      backstory: "10 years in tech, focused on B2B tools",
    },
    {
      id: "mock-2",
      name: "Bob Martinez",
      age: 28,
      occupation: "Startup Founder",
      educationLevel: "CS Degree",
      interests: ["AI/ML", "Growth hacking"],
      goals: ["Find product-market fit", "Scale quickly"],
      conscientiousness: 60,
      neuroticism: 45,
      openness: 90,
      extraversion: 80,
      agreeableness: 55,
      values: ["Innovation", "Speed", "Flexibility"],
      fears: ["Moving too slow", "Missing market opportunities"],
      communicationStyle: "Energetic and visionary",
      decisionStyle: "Gut-driven with rapid iteration",
      pricingSensitivity: 40,
      typicalBudget: "Up to $30/user/month for critical tools",
      backstory: "First-time founder, technical background",
    },
  ];
}

async function runBenchmark() {
  const flags = parseArgs();

  console.log("\n=== Kynd Benchmark ===");
  console.log(`Mode: ${flags.personasOnly ? "personas-only" : flags.useMockPersonas ? "mock-personas+report" : "personas+report"}`);
  console.log(`URL: ${flags.url}\n`);

  const results: { phase: string; timeMs: number }[] = [];

  if (!flags.useMockPersonas) {
    console.log("[1/2] Generating personas...");
    const startPersonas = Date.now();

    let personas: Persona[] = [];
    let personasTime = 0;
    let llmService: any = null;
    
    try {
      llmService = LlmServiceImpl.createFromEnv("openrouter");
      const useCase = new GeneratePersonasUseCase(llmService);
      personas = await useCase.execute(DEFAULT_PERSONA_DESCRIPTION);
      personasTime = Date.now() - startPersonas;
      results.push({ phase: "persona_generation", timeMs: personasTime });
      console.log(`      Done: ${formatTime(personasTime)}\n`);
    } catch (error: any) {
      personasTime = Date.now() - startPersonas;
      console.error(`      Error after ${formatTime(personasTime)}: ${error.message}\n`);
      
      if (flags.personasOnly) {
        console.log("=== Results (with error) ===");
        console.log(`Persona Generation: ${formatTime(personasTime)} (FAILED)`);
        console.log("");
        return;
      }
    }

    if (flags.personasOnly) {
      console.log("=== Results ===");
      console.log(`Persona Generation: ${formatTime(personasTime)}`);
      console.log("");
      return;
    }

    if (!llmService || personas.length === 0) {
      console.error("Cannot proceed with analysis: persona generation failed");
      return;
    }

    console.log("[2/2] Analyzing pricing page...");
    const startAnalysis = Date.now();

    const browserService = RemotePlaywrightAdapter.createFromEnv();
    const { ArtifactIntakeAdapter } = await import("@/infrastructure/adapters/ArtifactIntakeAdapter");
    const intakeAdapter = new ArtifactIntakeAdapter(browserService, llmService);
    const analysisUseCase = new AnalyzeArtifactUseCase(intakeAdapter, llmService);
    
    let analysisTime = 0;
    try {
      await analysisUseCase.execute({ type: "url", url: flags.url }, personas, "", "");
      analysisTime = Date.now() - startAnalysis;
      results.push({ phase: "pricing_analysis", timeMs: analysisTime });
      console.log(`      Done: ${formatTime(analysisTime)}\n`);
    } catch (error: any) {
      analysisTime = Date.now() - startAnalysis;
      console.error(`      Analysis error after ${formatTime(analysisTime)}: ${error.message}\n`);
    }

    await browserService.close();

    console.log("=== Results ===");
    console.log(`Persona Generation: ${formatTime(personasTime)}`);
    console.log(`Pricing Analysis:   ${formatTime(analysisTime)}`);
    console.log(`Total:               ${formatTime(personasTime + analysisTime)}`);
  } else {
    console.log("[1/1] Analyzing pricing page with mock personas...");
    const startAnalysis = Date.now();

    const personas = createMockPersonas();
    const browserService = RemotePlaywrightAdapter.createFromEnv();
    const llmService = LlmServiceImpl.createFromEnv("openrouter");
    const { ArtifactIntakeAdapter } = await import("@/infrastructure/adapters/ArtifactIntakeAdapter");
    const intakeAdapter = new ArtifactIntakeAdapter(browserService, llmService);
    const analysisUseCase = new AnalyzeArtifactUseCase(intakeAdapter, llmService);
    
    let analysisTime = 0;
    try {
      await analysisUseCase.execute({ type: "url", url: flags.url }, personas, "", "");
      analysisTime = Date.now() - startAnalysis;
      results.push({ phase: "pricing_analysis_mock", timeMs: analysisTime });
      console.log(`      Done: ${formatTime(analysisTime)}\n`);
    } catch (error: any) {
      analysisTime = Date.now() - startAnalysis;
      console.error(`      Analysis error after ${formatTime(analysisTime)}: ${error.message}\n`);
    }

    await browserService.close();

    console.log("=== Results ===");
    console.log(`Pricing Analysis (mock): ${formatTime(analysisTime)}`);
  }

  console.log("");
}

runBenchmark().catch(console.error);
