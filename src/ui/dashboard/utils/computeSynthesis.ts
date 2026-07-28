import type { PersonaResponse } from '@/domain/entities/PersonaResponse'
import type { ArtifactSynthesis, SynthesizedFinding, Disagreement } from '@/domain/entities/ArtifactSynthesis'

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
}

function wordOverlap(a: string, b: string): number {
  const wordsA = new Set(normalize(a).split(/\s+/).filter(w => w.length > 3))
  const wordsB = new Set(normalize(b).split(/\s+/).filter(w => w.length > 3))
  if (wordsA.size === 0 || wordsB.size === 0) return 0
  let shared = 0
  for (const w of wordsA) {
    if (wordsB.has(w)) shared++
  }
  return shared / Math.min(wordsA.size, wordsB.size)
}

function groupSimilarFindings(responses: PersonaResponse[]): SynthesizedFinding[] {
  const allFindings: { observation: string; evidence: string; impact: string; personaIndex: number }[] = []

  for (const r of responses) {
    for (const f of r.majorFindings) {
      allFindings.push({
        observation: f.observation,
        evidence: f.evidence,
        impact: f.impact,
        personaIndex: responses.indexOf(r),
      })
    }
  }

  const groups: { observation: string; evidence: string; impact: string; personaIndices: Set<number>; bestPersonaIndex: number }[] = []
  const assigned = new Set<number>()

  for (let i = 0; i < allFindings.length; i++) {
    if (assigned.has(i)) continue
    assigned.add(i)

    let bestObservation = allFindings[i].observation
    let bestEvidence = allFindings[i].evidence
    let bestImpact = allFindings[i].impact
    let bestPersonaIndex = allFindings[i].personaIndex
    const personaIndices = new Set([allFindings[i].personaIndex])

    for (let j = i + 1; j < allFindings.length; j++) {
      if (assigned.has(j)) continue
      if (wordOverlap(allFindings[i].observation, allFindings[j].observation) > 0.3) {
        assigned.add(j)
        personaIndices.add(allFindings[j].personaIndex)
        if (allFindings[j].observation.length > bestObservation.length) {
          bestObservation = allFindings[j].observation
          bestEvidence = allFindings[j].evidence
          bestImpact = allFindings[j].impact
          bestPersonaIndex = allFindings[j].personaIndex
        }
      }
    }

    groups.push({
      observation: bestObservation,
      evidence: bestEvidence,
      impact: bestImpact,
      personaIndices,
      bestPersonaIndex,
    })
  }

  const totalCount = responses.length
  return groups
    .filter(g => g.personaIndices.size > 0 && g.evidence.trim().length > 0)
    .map(g => {
      const name = responses[g.bestPersonaIndex]?.personaProfile?.name ?? `Persona ${g.bestPersonaIndex + 1}`
      return {
        observation: g.observation,
        evidence: `${name}: "${g.evidence}"`,
        impact: g.impact,
        confidence: g.personaIndices.size >= Math.ceil(totalCount * 0.8) ? 'High' as const : g.personaIndices.size >= Math.ceil(totalCount * 0.4) ? 'Medium' as const : 'Low' as const,
        affectedPersonaCount: g.personaIndices.size,
        totalPersonaCount: totalCount,
      }
    })
    .sort((a, b) => b.affectedPersonaCount - a.affectedPersonaCount)
}

function findDisagreements(responses: PersonaResponse[]): Disagreement[] {
  const stageOutcomes: Record<string, { outcome: string }[]> = {}

  for (const r of responses) {
    for (const stage of r.customerJourney) {
      const key = stage.stage
      if (!stageOutcomes[key]) stageOutcomes[key] = []
      stageOutcomes[key].push({ outcome: stage.outcome })
    }
  }

  const disagreements: Disagreement[] = []

  for (const [stage, outcomes] of Object.entries(stageOutcomes)) {
    const succeeded = outcomes.filter(o => o.outcome === 'succeeded').length
    const blocked = outcomes.length - succeeded

    if (succeeded > 0 && blocked > 0) {
      disagreements.push({
        topic: `Stage "${stage}" — personas split on progression`,
        split: [
          { view: 'Progressed successfully', personaCount: succeeded },
          { view: 'Stopped or blocked', personaCount: blocked },
        ],
        significance: blocked >= succeeded ? 'High' as const : 'Medium' as const,
      })
    }
  }

  return disagreements
}

function pickMostRepresentative(strings: string[]): string {
  if (strings.length === 0) return ''
  if (strings.length === 1) return strings[0]
  const scores = strings.map((s, i) => {
    let score = 0
    for (let j = 0; j < strings.length; j++) {
      if (i === j) continue
      score += wordOverlap(s, strings[j])
    }
    return { text: s, score }
  })
  scores.sort((a, b) => b.score - a.score)
  return scores[0].text
}

function toAnalystVoice(text: string): string {
  if (!text) return ''
  const cleaned = text
    .replace(/\bI\s+was\b/g, 'Personas were')
    .replace(/\bI\s+felt\b/g, 'Personas felt')
    .replace(/\bI\s+thought\b/g, 'Personas thought')
    .replace(/\bI\s+noticed\b/g, 'Personas noticed')
    .replace(/\bI\s+saw\b/g, 'Personas saw')
    .replace(/\bI\s+found\b/g, 'Personas found')
    .replace(/\bI\s+decided\b/g, 'Personas decided')
    .replace(/\bI\s+needed\b/g, 'Personas needed')
    .replace(/\bI\s+wanted\b/g, 'Personas wanted')
    .replace(/\bI\s+would\b/g, 'Personas would')
    .replace(/\bI\s+could\b/g, 'Personas could')
    .replace(/\bI'm\b/g, "Personas are")
    .replace(/\bI've\b/g, "Personas have")
    .replace(/\bI'd\b/g, "Personas would")
    .replace(/\bI'll\b/g, "Personas will")
    .replace(/\bmy\b/g, 'their')
    .replace(/\bme\b/g, 'them')
    .replace(/\bmyself\b/g, 'themselves')
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function stripTrailingPeriod(s: string): string {
  return s.replace(/[.!?]+$/, '')
}

function synthesizeRQA(topFindings: SynthesizedFinding[]): string {
  if (topFindings.length === 0) return ''
  const top = topFindings.slice(0, 3).map(f => stripTrailingPeriod(f.observation.toLowerCase()))
  if (top.length === 1) {
    return `Across the personas tested, the primary finding was that ${top[0]}.`
  }
  if (top.length === 2) {
    return `Across the personas tested, personas primarily noted that ${top[0]}, while a secondary concern was ${top[1]}.`
  }
  return `Across the personas tested, the most common findings were that ${top[0]}, ${top[1]}, and ${top[2]}.`
}

export function computeSynthesis(responses: PersonaResponse[]): ArtifactSynthesis {
  if (responses.length === 0) {
    return {
      overview: '',
      researchQuestionAnswer: '',
      topFindings: [],
      disagreements: [],
      biggestFrictions: [],
      completedCount: 0,
      failedCount: 0,
      totalPersonaCount: 0,
    }
  }

  const topFindings = groupSimilarFindings(responses)

  const allFrictions = responses.flatMap(r => r.pointsOfFriction)
  const frictionGroups: { text: string; count: number }[] = []
  for (const f of allFrictions) {
    let found = false
    for (const g of frictionGroups) {
      if (wordOverlap(f, g.text) > 0.3) {
        g.count++
        if (f.length > g.text.length) g.text = f
        found = true
        break
      }
    }
    if (!found) frictionGroups.push({ text: f, count: 1 })
  }
  frictionGroups.sort((a, b) => b.count - a.count)

  const overview = toAnalystVoice(pickMostRepresentative(responses.map(r => r.overview).filter(Boolean)))
  const rqa = synthesizeRQA(topFindings)

  return {
    overview,
    researchQuestionAnswer: rqa,
    topFindings,
    disagreements: findDisagreements(responses),
    biggestFrictions: frictionGroups.map(f => f.text),
    completedCount: responses.length,
    failedCount: 0,
    totalPersonaCount: responses.length,
  }
}
