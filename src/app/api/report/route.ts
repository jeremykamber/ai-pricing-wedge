import { NextResponse } from "next/server";
import { AnalyzeArtifactUseCase } from "@/application/usecases/AnalyzeArtifactUseCase";
import { RemotePlaywrightAdapter } from "@/infrastructure/adapters/RemotePlaywrightAdapter";
import { Persona } from "@/domain/entities/Persona";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";
import { AnalysisLogger } from "@/infrastructure/AnalysisLogger";

export async function POST(req: Request) {
    const requestStart = Date.now();
    const requestId = `report-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    console.log(`[REPORT API] === REQUEST START === requestId=${requestId}`);
    console.log(`[REPORT API] Method: POST, endpoint: /api/report`);

    try {
        const body = await req.json();
        const { url, personas, imageBase64 } = body;

        if (!personas || !Array.isArray(personas) || personas.length === 0) {
            console.log(`[REPORT API] Validation failed: missing/invalid personas`);
            return NextResponse.json(
                { error: "Missing or invalid 'personas' parameter - must be a non-empty array" },
                { status: 400 }
            );
        }

        for (let i = 0; i < personas.length; i++) {
            const p = personas[i];
            if (!p || typeof p !== 'object') {
                console.log(`[REPORT API] Validation failed: persona[${i}] is not an object`);
                return NextResponse.json(
                    { error: `Invalid persona at index ${i}: must be an object` },
                    { status: 400 }
                );
            }
            if (!p.id || typeof p.id !== 'string') {
                console.log(`[REPORT API] Validation failed: persona[${i}] missing id`);
                return NextResponse.json(
                    { error: `Invalid persona at index ${i}: missing or invalid 'id' field` },
                    { status: 400 }
                );
            }
            if (!p.name || typeof p.name !== 'string') {
                console.log(`[REPORT API] Validation failed: persona[${i}] missing name`);
                return NextResponse.json(
                    { error: `Invalid persona at index ${i}: missing or invalid 'name' field` },
                    { status: 400 }
                );
            }
        }
        console.log(`[REPORT API] Request body parsed`, {
            url,
            personaCount: personas?.length ?? 0,
            personaNames: personas?.map((p: Persona) => p.name) ?? [],
            hasImage: !!imageBase64,
        });

        if (!url || typeof url !== "string") {
            console.log(`[REPORT API] Validation failed: missing/invalid url`);
            return NextResponse.json(
                { error: "Missing or invalid 'url' parameter" },
                { status: 400 }
            );
        }


        const id = requestId;

        // Initialize logger for this API run
        const log = AnalysisLogger.forRun(id);
        await log.init();
        log.info("ReportAPI", "Processing report request", {
            url,
            personaCount: personas.length,
            personaNames: personas.map((p: Persona) => p.name),
            hasImage: !!imageBase64,
        });

        console.log(`[REPORT API] Instantiating dependencies...`);
        const browserService = RemotePlaywrightAdapter.createFromEnv();
        const llmService = LlmServiceImpl.createFromEnv("openrouter");
        const { ArtifactIntakeAdapter } = await import("@/infrastructure/adapters/ArtifactIntakeAdapter");
        const intakeAdapter = new ArtifactIntakeAdapter(browserService, llmService);
        const useCase = new AnalyzeArtifactUseCase(intakeAdapter, llmService);

        const executeStart = Date.now();
        console.log(`[REPORT API] Calling useCase.execute()...`);

        const input = imageBase64
            ? { type: "screenshot" as const, imageBase64, url }
            : { type: "url" as const, url };
        const responses = await useCase.execute(
            input,
            personas as Persona[],
            "",
            "",
            undefined,
            undefined,
            { runId: id }
        );

        const executeDuration = Date.now() - executeStart;
        console.log(`[REPORT API] useCase.execute() completed in ${executeDuration}ms with ${responses.length} responses`);

        responses.forEach((r, i) => {
            console.log(`[REPORT API] Response[${i}]: id=${r.id}, stages=${r.customerJourney.length}, findings=${r.majorFindings.length}`);
        });

        log.info("ReportAPI", "Report generation complete", {
            executeDurationMs: executeDuration,
            responseCount: responses.length,
            totalDurationMs: Date.now() - requestStart,
        });
        await log.close();
        AnalysisLogger.removeRun(id);

        console.log(`[REPORT API] === REQUEST COMPLETE === (${Date.now() - requestStart}ms)`);

        return NextResponse.json({
            requestId: id,
            url,
            personaCount: personas.length,
            analyses: responses,
        });
    } catch (error) {
        const errMsg = (error as Error).message;
        const errStack = (error as Error).stack;
        console.error(`[REPORT API] ERROR: ${errMsg}`);
        console.error(`[REPORT API] Stack: ${errStack?.split('\n').slice(0, 6).join('\n')}`);
        console.log(`[REPORT API] === REQUEST FAILED === (${Date.now() - requestStart}ms)`);

        return NextResponse.json(
            { error: errMsg },
            { status: 500 }
        );
    }
}
