import { describe, it, expect } from 'vitest'
import { summarizeError, GENERIC_ERROR_SUMMARY } from '../errorSummary'

describe('summarizeError', () => {
  it('returns the first line of a multi-line message', () => {
    expect(summarizeError('Line one\nLine two\nLine three')).toBe('Line one')
  })

  it('skips leading blank lines before the first line', () => {
    expect(summarizeError('\n\nReal message here\nmore')).toBe('Real message here')
  })

  it('falls back to the generic phrase for JSON blob first lines', () => {
    const json = '{"error":{"message":"Model rate limited","stack":"at ..."}}\nStack trace...'
    expect(summarizeError(json)).toBe(GENERIC_ERROR_SUMMARY)
    expect(summarizeError('[{"id":1},{"id":2}]')).toBe(GENERIC_ERROR_SUMMARY)
  })

  it('truncates long first lines with an ellipsis', () => {
    const long = 'x'.repeat(200)
    const result = summarizeError(long)
    expect(result.length).toBe(161) // 160 chars + ellipsis
    expect(result.startsWith('x'.repeat(160))).toBe(true)
    expect(result.endsWith('…')).toBe(true)
  })

  it('returns Unknown error for empty or whitespace-only input', () => {
    expect(summarizeError('')).toBe('Unknown error')
    expect(summarizeError('   ')).toBe('Unknown error')
    expect(summarizeError('\n\n \n')).toBe('Unknown error')
  })

  it('keeps short messages intact', () => {
    expect(summarizeError('Model timed out')).toBe('Model timed out')
  })
})
