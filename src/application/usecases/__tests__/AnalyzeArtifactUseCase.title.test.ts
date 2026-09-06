import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AnalyzeArtifactUseCase } from '../AnalyzeArtifactUseCase'
import { ArtifactIntakeAdapter } from '@/infrastructure/adapters/ArtifactIntakeAdapter'
import { LlmServicePort } from '@/domain/ports/LlmServicePort'
import type { ArtifactIntake } from '@/domain/entities/ArtifactIntake'

describe('AnalyzeArtifactUseCase title generation', () => {
  let useCase: AnalyzeArtifactUseCase
  let mockIntake: { intake: ReturnType<typeof vi.fn> }
  let mockLlm: LlmServicePort

  const intake: ArtifactIntake = {
    screenshotBase64: 'base64img',
    url: 'https://example.com',
    summaryPromise: Promise.resolve('A B2B pricing page.'),
    pageHtml: '<html><body>pricing</body></html>',
  }

  beforeEach(() => {
    mockIntake = { intake: vi.fn().mockResolvedValue(intake) }
    mockLlm = {
      generateSimulationTitle: vi.fn().mockResolvedValue('Example title'),
    } as any
    useCase = new AnalyzeArtifactUseCase(mockIntake as any, mockLlm)
  })

  it('generates a title from the research context + artifact and streams it via onProgress', async () => {
    const progress: any[] = []
    await useCase.execute(
      { type: 'url', url: 'https://example.com' },
      [],
      'Increase conversions',
      'Why do founders hesitate?',
      (p) => progress.push(p),
    )

    expect(mockLlm.generateSimulationTitle).toHaveBeenCalledWith(
      expect.objectContaining({
        businessGoal: 'Increase conversions',
        researchQuestion: 'Why do founders hesitate?',
        artifactUrl: 'https://example.com',
        pageSummary: 'A B2B pricing page.',
        screenshotBase64: 'base64img',
      }),
      expect.anything(),
    )
    expect(progress.some((p) => p.title === 'Example title')).toBe(true)
  })

  it('does not fail the run when title generation throws (nice-to-have)', async () => {
    (mockLlm.generateSimulationTitle as any).mockRejectedValue(new Error('model down'))

    await expect(
      useCase.execute({ type: 'url', url: 'https://example.com' }, [], 'goal', 'question'),
    ).resolves.toEqual([])
  })
})
