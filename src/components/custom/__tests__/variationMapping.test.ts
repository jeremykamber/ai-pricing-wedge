import { describe, it, expect } from 'vitest'
import { mapToDiscrete, mapFromDiscrete } from '../variationMapping'

describe('mapToDiscrete', () => {
  it('should map 0 to 1', () => {
    expect(mapToDiscrete(0)).toBe(1)
  })

  it('should map 50 to 3 (middle)', () => {
    expect(mapToDiscrete(50)).toBe(3)
  })

  it('should map 100 to 5', () => {
    expect(mapToDiscrete(100)).toBe(5)
  })

  it('should map 20 to 1', () => {
    expect(mapToDiscrete(20)).toBe(1)
  })

  it('should map 40 to 2', () => {
    expect(mapToDiscrete(40)).toBe(2)
  })

  it('should map 60 to 3', () => {
    expect(mapToDiscrete(60)).toBe(3)
  })

  it('should map 80 to 4', () => {
    expect(mapToDiscrete(80)).toBe(4)
  })

  it('should clamp values below 0 to 1', () => {
    expect(mapToDiscrete(-10)).toBe(1)
  })

  it('should clamp values above 100 to 5', () => {
    expect(mapToDiscrete(110)).toBe(5)
  })

  it('should round values to nearest discrete step', () => {
    expect(mapToDiscrete(10)).toBe(1)  // 0.5 -> 1
    expect(mapToDiscrete(30)).toBe(2)  // 1.5 -> 2
    expect(mapToDiscrete(49)).toBe(2)  // 2.45 -> 2
    expect(mapToDiscrete(50)).toBe(3)  // 2.5 -> 3
    expect(mapToDiscrete(70)).toBe(4)  // 3.5 -> 4
    expect(mapToDiscrete(90)).toBe(5)  // 4.5 -> 5
  })

  it('should map all expected increments correctly', () => {
    // 1,2,3,4,5 are the valid outputs
    const results = [0, 20, 40, 60, 80, 100].map(mapToDiscrete)
    expect(results).toEqual([1, 1, 2, 3, 4, 5])
  })
})

describe('mapFromDiscrete', () => {
  it('should map 1 to 20', () => {
    expect(mapFromDiscrete(1)).toBe(20)
  })

  it('should map 3 to 60', () => {
    expect(mapFromDiscrete(3)).toBe(60)
  })

  it('should map 5 to 100', () => {
    expect(mapFromDiscrete(5)).toBe(100)
  })

  it('should maintain round-trip consistency', () => {
    // 20 should map to 1 and back to 20
    expect(mapFromDiscrete(mapToDiscrete(20))).toBe(20)
    // 50 should map to 3 and back to 60
    expect(mapFromDiscrete(mapToDiscrete(50))).toBe(60)
    // 100 should map to 5 and back to 100
    expect(mapFromDiscrete(mapToDiscrete(100))).toBe(100)
  })
})
