import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import type { ArtifactAnalysis } from '@/domain/entities/ArtifactAnalysis'
import type { ArtifactSynthesis } from '@/domain/entities/ArtifactSynthesis'
import { computeSynthesis } from '@/ui/dashboard/utils/computeSynthesis'

// ── Typography & Palette ───────────────────────────────────────────────────
// Simple, clean, editorial design with high legibility and quiet accents.
const colors = {
  primary: '#111827',
  primaryLight: '#374151',
  muted: '#6b7280',
  mutedLight: '#9ca3af',
  border: '#e5e7eb',
  borderDark: '#d1d5db',
  bgLight: '#f9fafb',
  bgCard: '#ffffff',
  accent: '#2563eb',
  accentLight: '#eff6ff',
  accentBorder: '#bfdbfe',
  success: '#15803d',
  successBg: '#f0fdf4',
  destructive: '#b91c1c',
  destructiveBg: '#fef2f2',
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: colors.primary,
    backgroundColor: '#ffffff',
    lineHeight: 1.4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1.5,
    borderBottomColor: colors.primary,
    paddingBottom: 14,
    marginBottom: 20,
  },
  brandName: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.2,
    color: colors.primary,
    lineHeight: 1.2,
    marginBottom: 4,
  },
  brandSubtitle: {
    fontSize: 8.5,
    color: colors.muted,
    lineHeight: 1.2,
  },
  reportTitle: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: colors.primary,
    lineHeight: 1.3,
    marginBottom: 14,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    backgroundColor: colors.bgLight,
    padding: 10,
    borderRadius: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaItem: {
    flexDirection: 'column',
  },
  metaLabel: {
    fontSize: 7,
    textTransform: 'uppercase',
    color: colors.muted,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 8.5,
    color: colors.primaryLight,
  },
  sectionTitle: {
    fontSize: 10.5,
    fontFamily: 'Helvetica-Bold',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 4,
  },
  calloutBox: {
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: 4,
    padding: 10,
    marginBottom: 14,
  },
  calloutTitle: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  calloutText: {
    fontSize: 9,
    color: colors.primaryLight,
    lineHeight: 1.45,
  },
  findingCard: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
  },
  findingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  findingObservation: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: colors.primary,
    flex: 1,
    marginRight: 10,
  },
  badgeContainer: {
    paddingVertical: 2.5,
    paddingHorizontal: 7,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  badgePrimaryBg: {
    backgroundColor: colors.accentLight,
    borderWidth: 0.5,
    borderColor: colors.accentBorder,
  },
  badgeSuccessBg: {
    backgroundColor: colors.successBg,
  },
  badgeDestructiveBg: {
    backgroundColor: colors.destructiveBg,
  },
  badgeText: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    lineHeight: 1.1,
  },
  badgePrimaryText: {
    color: colors.accent,
  },
  badgeSuccessText: {
    color: colors.success,
  },
  badgeDestructiveText: {
    color: colors.destructive,
  },
  findingBody: {
    marginTop: 2,
  },
  findingLabel: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: colors.muted,
    textTransform: 'uppercase',
    marginTop: 3,
    marginBottom: 1,
  },
  findingText: {
    fontSize: 8.5,
    color: colors.primaryLight,
    lineHeight: 1.35,
  },
  personaCard: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: 4,
    padding: 12,
    marginBottom: 14,
  },
  personaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 6,
    marginBottom: 8,
  },
  personaName: {
    fontSize: 10.5,
    fontFamily: 'Helvetica-Bold',
    color: colors.primary,
  },
  personaMeta: {
    fontSize: 8,
    color: colors.muted,
    marginTop: 1,
  },
  journeyTable: {
    marginTop: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    backgroundColor: colors.bgLight,
  },
  journeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  journeyStageName: {
    width: 85,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'capitalize',
    color: colors.primaryLight,
  },
  journeyDesc: {
    flex: 1,
    fontSize: 8,
    color: colors.primaryLight,
    paddingRight: 10,
    lineHeight: 1.35,
  },
  journeyOutcomeContainer: {
    width: 75,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContainer: {
    marginTop: 4,
    marginBottom: 12,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  bullet: {
    width: 12,
    fontSize: 8.5,
    color: colors.muted,
  },
  listText: {
    flex: 1,
    fontSize: 8.5,
    color: colors.primaryLight,
    lineHeight: 1.35,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    fontSize: 7.5,
    color: colors.mutedLight,
  },
})

export interface AnalysisPdfDocumentProps {
  analysis: ArtifactAnalysis
}

export function AnalysisPdfDocument({ analysis }: AnalysisPdfDocumentProps) {
  const responses = analysis.responses ?? []
  const synthesis: ArtifactSynthesis =
    analysis.synthesis ?? computeSynthesis(responses)

  const formattedDate = new Date(
    analysis.completedAt || analysis.createdAt || Date.now()
  ).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return (
    <Document
      title={analysis.name || 'Kynd User Testing Report'}
      author="Kynd AI"
      subject="User Testing Simulation Briefing"
    >
      {/* ── Page 1: Executive Briefing ─────────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brandName}>Kynd</Text>
            <Text style={styles.brandSubtitle}>AI User Testing Simulation Report</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 8, color: colors.muted }}>Generated on</Text>
            <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: colors.primaryLight, marginTop: 1 }}>
              {formattedDate}
            </Text>
          </View>
        </View>

        {/* Title & Metadata */}
        <Text style={styles.reportTitle}>{analysis.name || 'Artifact Analysis'}</Text>
        <View style={styles.metaGrid}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Target Artifact</Text>
            <Text style={styles.metaValue}>{analysis.url}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Audience Batch</Text>
            <Text style={styles.metaValue}>{analysis.batchName || `${analysis.personaCount} Personas`}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Completion</Text>
            <Text style={styles.metaValue}>
              {synthesis.completedCount} of {synthesis.totalPersonaCount} personas completed
              {synthesis.failedCount > 0 ? ` (${synthesis.failedCount} failed)` : ''}
            </Text>
          </View>
        </View>

        {/* Research Question & Answer */}
        {synthesis.researchQuestionAnswer && (
          <View style={styles.calloutBox} wrap={false}>
            <Text style={styles.calloutTitle}>Core Research Finding</Text>
            <Text style={styles.calloutText}>{synthesis.researchQuestionAnswer}</Text>
          </View>
        )}

        {/* Executive Overview */}
        {synthesis.overview && (
          <View style={{ marginBottom: 12 }} wrap={false}>
            <Text style={styles.sectionTitle}>Executive Overview</Text>
            <Text style={{ fontSize: 8.5, color: colors.primaryLight, lineHeight: 1.45 }}>
              {synthesis.overview}
            </Text>
          </View>
        )}

        {/* Top Synthesized Findings */}
        {synthesis.topFindings.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.sectionTitle}>Key Findings</Text>
            {synthesis.topFindings.slice(0, 4).map((finding, idx) => (
              <View key={idx} style={styles.findingCard} wrap={false}>
                <View style={styles.findingHeader}>
                  <Text style={styles.findingObservation}>{finding.observation}</Text>
                  <View style={[styles.badgeContainer, styles.badgePrimaryBg]}>
                    <Text style={[styles.badgeText, styles.badgePrimaryText]}>
                      {finding.affectedPersonaCount}/{finding.totalPersonaCount} observed
                    </Text>
                  </View>
                </View>
                <View style={styles.findingBody}>
                  <Text style={styles.findingLabel}>Evidence</Text>
                  <Text style={styles.findingText}>{finding.evidence}</Text>
                  {finding.impact && (
                    <>
                      <Text style={styles.findingLabel}>Impact</Text>
                      <Text style={styles.findingText}>{finding.impact}</Text>
                    </>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Friction Points & Unanswered Questions */}
        {synthesis.biggestFrictions && synthesis.biggestFrictions.length > 0 && (
          <View style={{ marginBottom: 12 }} wrap={false}>
            <Text style={styles.sectionTitle}>Primary Points of Friction</Text>
            <View style={styles.listContainer}>
              {synthesis.biggestFrictions.map((friction, idx) => (
                <View key={idx} style={styles.listItem}>
                  <Text style={styles.bullet}>•</Text>
                  <Text style={styles.listText}>{friction}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>Kynd AI · Behavioral User Simulation Report</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>

      {/* ── Page 2+: Persona Journeys & Detailed Breakdowns ────────────── */}
      {responses.length > 0 && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.sectionTitle}>Individual Persona Breakdowns</Text>

          {responses.map((resp, pIdx) => {
            const profile = resp.personaProfile
            const name = profile?.name || `Persona ${pIdx + 1}`
            const role = profile?.occupation || ''

            return (
              <View key={resp.id || pIdx} style={styles.personaCard} wrap={false}>
                {/* Persona Header */}
                <View style={styles.personaHeader}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.personaName}>{name}</Text>
                    {role ? <Text style={styles.personaMeta}>{role}</Text> : null}
                  </View>
                  {profile?.communicationStyle ? (
                    <View style={[styles.badgeContainer, styles.badgePrimaryBg]}>
                      <Text style={[styles.badgeText, styles.badgePrimaryText]}>
                        {profile.communicationStyle}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Persona Summary */}
                {resp.overview && (
                  <View style={{ marginBottom: 6 }}>
                    <Text style={{ fontSize: 8.5, color: colors.primaryLight, fontStyle: 'italic', lineHeight: 1.35 }}>
                      "{resp.overview}"
                    </Text>
                  </View>
                )}

                {/* 5-Stage Cognitive Journey */}
                {resp.customerJourney && resp.customerJourney.length > 0 && (
                  <View style={styles.journeyTable}>
                    {resp.customerJourney.map((stg, sIdx) => {
                      const isSuccess = stg.outcome === 'succeeded'
                      const isBlocked = stg.outcome === 'blocked'
                      const badgeBg = isSuccess
                        ? styles.badgeSuccessBg
                        : isBlocked
                        ? styles.badgeDestructiveBg
                        : styles.badgePrimaryBg
                      const badgeText = isSuccess
                        ? styles.badgeSuccessText
                        : isBlocked
                        ? styles.badgeDestructiveText
                        : styles.badgePrimaryText

                      const outcomeLabel =
                        stg.outcome.charAt(0).toUpperCase() + stg.outcome.slice(1)

                      return (
                        <View
                          key={sIdx}
                          style={[
                            styles.journeyRow,
                            sIdx === resp.customerJourney.length - 1 ? { borderBottomWidth: 0 } : {},
                          ]}
                        >
                          <Text style={styles.journeyStageName}>{stg.stage}</Text>
                          <Text style={styles.journeyDesc}>{stg.description}</Text>
                          <View style={styles.journeyOutcomeContainer}>
                            <View style={[styles.badgeContainer, badgeBg]}>
                              <Text style={[styles.badgeText, badgeText]}>{outcomeLabel}</Text>
                            </View>
                          </View>
                        </View>
                      )
                    })}
                  </View>
                )}

                {/* Persona Specific Findings */}
                {resp.majorFindings && resp.majorFindings.length > 0 && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={styles.findingLabel}>Observed Findings</Text>
                    <View style={{ marginTop: 4 }}>
                      {resp.majorFindings.slice(0, 2).map((f, fIdx) => (
                        <View key={fIdx} style={{ flexDirection: 'row', marginBottom: 4 }}>
                          <Text style={styles.bullet}>•</Text>
                          <Text style={styles.findingText}>
                            <Text style={{ fontFamily: 'Helvetica-Bold' }}>{f.observation}: </Text>
                            {f.evidence}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            )
          })}

          {/* Footer */}
          <View style={styles.footer} fixed>
            <Text>Kynd AI · Behavioral User Simulation Report</Text>
            <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
          </View>
        </Page>
      )}
    </Document>
  )
}
