/**
 * One-off replay: run extractPersonaResponse with the real adapter against
 * the real model, logging the swallowed stream error instead of returning
 * null. Diagnoses why Remy's extraction failed 3x in bench run 3.
 */
import "dotenv/config";
import { streamObject } from "ai";
import { LlmServiceImpl } from "../src/infrastructure/adapters/LlmServiceImpl";
import { VisionAnalysisAdapter } from "../src/infrastructure/adapters/VisionAnalysisAdapter";
import type { Persona } from "../src/domain/entities/Persona";

const MONOLOGUE = `Jobright. Okay. Green background. Looks clean, maybe a little sterile. Like a health app or a fintech thing. Not really "catering."

Top bar... Job seekers, Employers. I'm an employer, obviously. But then AI Agent? Resume AI? This looks like it's for people looking for work. Me? I'm hiring. I have nine mouths to feed, staff-wise, not the other way around.

"No More Solo Job Hunting. Do it with AI." That's for the job hunter. Where's the employer side of this thing? I click Employers.

Job listings. Backend engineer, product designer. That's me hiring — but this says "2000 openings in March alone." I'm not browsing. I need a cook for Saturday.

Try For Free — free, okay, my language. But it wants an email before it even tells me what the free thing IS. Free trial of what? Sourcing? The AI agent? Vague. Vague is expensive in my world.

Scroll. Testimonials — every one of them a job seeker. "Landed my dream role." Great for them. Where's the catering owner who hired three line cooks in a week? Not here.

Pricing tab. "Contact sales." Contact. Sales. For a free tool? If the free tier needs a salesman to explain it, it's not free, it's bait.

FAQ. "Is Jobright really free? Yes, for job seekers." There it is. For job seekers. I'm the wrong guy on the wrong website.

Clicking away. Back to my spreadsheets.`;

const REMY: Persona = {
  id: "bench-remy",
  name: "Remy",
  occupation: "Owner of a family-run catering business",
  backstory:
    "Remy runs a family catering business with 9 staff. He distrusts anything that asks for a credit card upfront and prefers tools his nephew can explain to him.",
  goals: ["Evaluate whether this product helps my business today"],
  conscientiousness: 60,
  neuroticism: 65,
  openness: 45,
  extraversion: 50,
  agreeableness: 65,
  values: ["time savings", "clear pricing"],
  fears: ["wasting money", "losing control of my data"],
  communicationStyle: "direct, skeptical",
  decisionStyle: "fast, practical",
} as Persona;

async function main() {
  const llm = LlmServiceImpl.createFromEnv("openrouter");
  const adapter = new VisionAnalysisAdapter(llm);

  // Instrument: wrap the raw fetch to surface stream failures the adapter's
  // .catch(() => null) would swallow.
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const resp = await origFetch(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input instanceof Request ? input.url : "";
    if (url.includes("/chat/completions")) {
      const clone = resp.clone();
      void clone.text().then((body) => {
        try {
          const parsed = JSON.parse(body) as { choices?: Array<{ finish_reason?: string }> };
          const finish = parsed.choices?.[0]?.finish_reason;
          console.log(`[probe] finish_reason=${finish ?? "?"}`);
        } catch {
          console.log(`[probe] non-JSON response (${body.length} bytes)`);
        }
      });
    }
    return resp;
  };

  const start = Date.now();
  try {
    const response = await adapter.extractPersonaResponse(REMY, MONOLOGUE, "Why doesn't the user get the free version?", {
      runId: "probe-replay",
      tokenLimit: 2000,
      artifactName: "Jobright",
    });
    console.log(`SUCCESS in ${Date.now() - start}ms stages=${response.customerJourney.length} findings=${response.majorFindings.length}`);
  } catch (err) {
    console.log(`REPLAY FAILED in ${Date.now() - start}ms: ${String(err).slice(0, 500)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
