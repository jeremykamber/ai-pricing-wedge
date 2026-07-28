import type { PersonaResponse } from '@/domain/entities/PersonaResponse'
import type { CognitiveStage } from '@/domain/entities/CognitiveStage'
import type { ArtifactSynthesis, SynthesizedFinding, ConsensusArea, Disagreement } from '@/domain/entities/ArtifactSynthesis'

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
  const allFindings: { finding: SynthesizedFinding; personaName: string }[] = []

  for (const r of responses) {
    for (const f of r.majorFindings) {
      allFindings.push({
        finding: {
          observation: f.observation,
          evidence: f.evidence,
          impact: f.impact,
          confidence: f.confidence,
          affectedPersonas: [r.personaProfile?.name || 'Unknown'],
        },
        personaName: r.personaProfile?.name || 'Unknown',
      })
    }
  }

  const groups: SynthesizedFinding[] = []
  const assigned = new Set<number>()

  for (let i = 0; i < allFindings.length; i++) {
    if (assigned.has(i)) continue
    assigned.add(i)

    const group: SynthesizedFinding = {
      observation: allFindings[i].finding.observation,
      evidence: allFindings[i].finding.evidence,
      impact: allFindings[i].finding.impact,
      confidence: allFindings[i].finding.confidence,
      affectedPersonas: [allFindings[i].personaName],
    }

    for (let j = i + 1; j < allFindings.length; j++) {
      if (assigned.has(j)) continue
      const overlap = wordOverlap(
        allFindings[i].finding.observation,
        allFindings[j].finding.observation,
      )
      if (overlap > 0.3) {
        assigned.add(j)
        group.affectedPersonas.push(allFindings[j].personaName)
        if (allFindings[j].finding.observation.length > group.observation.length) {
          group.observation = allFindings[j].finding.observation
        }
        group.evidence += ` ${allFindings[j].finding.evidence}`
      }
    }

    // Aggregate confidence based on agreement count
    const personaCount = group.affectedPersonas.length
    if (personaCount >= 3) group.confidence = 'High'
    else if (personaCount >= 2) group.confidence = 'Medium'
    else group.confidence = 'Low'

    groups.push(group)
  }

  // Sort by affected persona count (most consensus first)
  groups.sort((a, b) => b.affectedPersonas.length - a.affectedPersonas.length)

  return groups
}

function findDisagreements(responses: PersonaResponse[]): Disagreement[] {
  const disagreements: Disagreement[] = []

  // Group personas by their highest stage outcome for disagreement detection
  const stageOutcomes: Record<string, { personaName: string; outcome: string; stage: string }[]> = {}

  for (const r of responses) {
    for (const stage of r.customerJourney) {
      const key = stage.stage
      if (!stageOutcomes[key]) stageOutcomes[key] = []
      stageOutcomes[key].push({
        personaName: r.personaProfile?.name || 'Unknown',
        outcome: stage.outcome,
        stage: stage.stage,
      })
    }
  }

  // Find stages where personas split (some succeeded, some blocked)
  for (const [stage, outcomes] of Object.entries(stageOutcomes)) {
    const succeeded = outcomes.filter(o => o.outcome === 'succeeded').map(o => o.personaName)
    const blocked = outcomes.filter(o => o.outcome !== 'succeeded').map(o => o.personaName)

    if (succeeded.length > 0 && blocked.length > 0) {
      disagreements.push({
        topic: `Stage "${stage}" — personas split on progression`,
        split: [
          { view: 'Progressed successfully', personaNames: succeeded },
          { view: 'Stopped or blocked', personaNames: blocked },
        ],
        significance: blocked.length >= succeeded.length ? 'High' : 'Medium',
      })
    }
  }

  return disagreements
}

function findConsensus(responses: PersonaResponse[]): ConsensusArea[] {
  const groups = groupSimilarFindings(responses)
  return groups
    .filter(g => g.affectedPersonas.length >= Math.ceil(responses.length / 2))
    .map(g => ({
      topic: g.observation,
      agreement: g.evidence.slice(0, 200),
      personaCount: g.affectedPersonas.length,
      personaNames: g.affectedPersonas,
    }))
}

export function computeSynthesis(responses: PersonaResponse[]): ArtifactSynthesis {
  if (responses.length === 0) {
    return {
      overview: '',
      researchQuestionAnswer: '',
      topFindings: [],
      consensus: [],
      disagreements: [],
      biggestFrictions: [],
      personaCount: 0,
    }
  }

  const topFindings = groupSimilarFindings(responses)
  const disagreements = findDisagreements(responses)
  const consensus = findConsensus(responses)

  // Collect all friction points
  const allFrictions = responses.flatMap(r =>
    r.pointsOfFriction.map(f => ({ text: f, personaName: r.personaProfile?.name || 'Unknown' }))
  )

  // Group friction by similarity
  const frictionGroups: { text: string; personas: string[] }[] = []
  for (const f of allFrictions) {
    let found = false
    for (const g of frictionGroups) {
      if (wordOverlap(f.text, g.text) > 0.3) {
        g.personas.push(f.personaName)
        if (f.text.length > g.text.length) g.text = f.text
        found = true
        break
      }
    }
    if (!found) frictionGroups.push({ text: f.text, personas: [f.personaName] })
  }
  frictionGroups.sort((a, b) => b.personas.length - a.personas.length)

  // Use first response's researchQuestionAnswer as synthesis-level answer
  const researchQuestionAnswer = responses[0].researchQuestionAnswer || ''

  // Build overview from first response overview if available
  const overview = responses[0].overview || ''

  return {
    overview,
    researchQuestionAnswer,
    topFindings,
    consensus,
    disagreements,
    biggestFrictions: frictionGroups.map(f => f.text),
    personaCount: responses.length,
  }
}
