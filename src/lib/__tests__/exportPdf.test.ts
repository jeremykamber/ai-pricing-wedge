import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generatePdfFilename, exportAnalysisAsPdf } from '../exportPdf'
import type { ArtifactAnalysis } from '@/domain/entities/ArtifactAnalysis'

describe('generatePdfFilename', () => {
  it('sanitizes special characters, quotes, and punctuation', () => {
    const filename = generatePdfFilename('"SaaS ICPs" on Acme.com! (v2)', new Date('2026-08-20T12:00:00.000Z'))
    expect(filename).toBe('kynd-report-saas-icps-on-acme-com-v2-2026-08-20.pdf')
  })

  it('handles empty or undefined analysis name gracefully', () => {
    const filename = generatePdfFilename(undefined, new Date('2026-08-20T12:00:00.000Z'))
    expect(filename).toBe('kynd-report-analysis-2026-08-20.pdf')
  })

  it('collapses multiple hyphens and trims leading/trailing hyphens', () => {
    const filename = generatePdfFilename('---Special --- Report ---', new Date('2026-08-20T12:00:00.000Z'))
    expect(filename).toBe('kynd-report-special-report-2026-08-20.pdf')
  })
})

describe('exportAnalysisAsPdf', () => {
  const mockAnalysis: ArtifactAnalysis = {
    id: 'analysis-1',
    name: 'Test Report',
    url: 'https://example.com',
    status: 'COMPLETED',
    personaCount: 1,
    createdAt: '2026-08-20T12:00:00.000Z',
    responses: [],
  }

  beforeEach(() => {
    vi.spyOn(globalThis.URL, 'createObjectURL').mockReturnValue('blob:http://localhost/12345')
    vi.spyOn(globalThis.URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders pdf blob and triggers download in browser', async () => {
    const clickSpy = vi.fn()
    const mockAnchor = {
      href: '',
      download: '',
      click: clickSpy,
      style: {},
    } as unknown as HTMLAnchorElement

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return mockAnchor
      }
      return document.createElement(tag)
    })
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor)
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockAnchor)

    await exportAnalysisAsPdf(mockAnalysis)

    expect(globalThis.URL.createObjectURL).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/12345')
  })
})
