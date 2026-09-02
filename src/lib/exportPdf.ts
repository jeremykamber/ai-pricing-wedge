import React from 'react'
import { pdf } from '@react-pdf/renderer'
import { AnalysisPdfDocument } from '@/components/custom/AnalysisPdfDocument'
import type { ArtifactAnalysis } from '@/domain/entities/ArtifactAnalysis'

/**
 * Sanitizes an analysis title and appends a date stamp into a clean, filesystem-safe PDF filename.
 * Example: '"SaaS Founders" on stripe.com' -> 'kynd-report-saas-founders-on-stripe-com-2026-08-20.pdf'
 */
export function generatePdfFilename(
  analysisName?: string,
  dateInput?: string | number | Date
): string {
  const dateObj = dateInput ? new Date(dateInput) : new Date()
  const dateStr = !isNaN(dateObj.getTime())
    ? dateObj.toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0]

  const cleanName = (analysisName || 'analysis')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const finalName = cleanName.length > 0 ? cleanName : 'analysis'
  return `kynd-report-${finalName}-${dateStr}.pdf`
}

/**
 * Compiles the AnalysisPdfDocument to a PDF Blob on the client and triggers an immediate browser download.
 */
export async function exportAnalysisAsPdf(analysis: ArtifactAnalysis): Promise<void> {
  const doc = AnalysisPdfDocument({ analysis })
  const blob = await pdf(doc).toBlob()
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  const url = URL.createObjectURL(blob)
  const filename = generatePdfFilename(
    analysis.name,
    analysis.completedAt || analysis.createdAt
  )

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'

  document.body.appendChild(anchor)
  anchor.click()

  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
