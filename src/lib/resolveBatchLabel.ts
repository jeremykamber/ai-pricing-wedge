import type { Persona } from '@/domain/entities/Persona'
import { generateBatchTitleAction } from '@/actions/generateBatchTitleAction'

/**
 * Async helper that names a batch at creation time. Tries an AI-generated
 * title from the personas' basic info; falls back to the default label if the
 * model call fails or returns nothing. Keeps the four batch-creation call
 * sites (description stream, description polling, interview stream, interview
 * polling) from each duplicating the try/catch + fallback.
 */
export async function resolveBatchLabel(
    fallback: string,
    personas: Persona[],
    context: {
        source?: 'description' | 'interviews';
        description?: string;
        transcriptCount?: number;
    } = {},
): Promise<string> {
    try {
        const { title } = await generateBatchTitleAction(personas, context)
        if (title && title.trim()) return title.trim()
    } catch {
        // fall through to the default
    }
    return fallback
}
