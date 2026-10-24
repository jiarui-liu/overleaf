import { expect } from 'vitest'

const modulePath =
  '../../../../app/src/Features/Chat/AiTutorReviewOrchestrator.mjs'

describe('AiTutorReviewOrchestrator', function () {
  beforeEach(async function (ctx) {
    ctx.module = await import(modulePath)
  })

  describe('deduplicateComments', function () {
    const mergedTex =
      '\\section{Limitations}\n' +
      'Table 5 shows our model reaches 91.2 F1 on XNLI, which we report here for the first time.\n' +
      'We only evaluate on English data.\n'
    const scope = {
      highlightText: 'Table 5 shows our model reaches 91.2 F1 on XNLI',
      comment:
        'This limitations paragraph reports new results (91.2 F1 on XNLI) that belong in the Results section. Move them there; ARR can desk-reject papers that put main-paper content in Limitations.',
      severity: 'critical',
      category: 'conclusion',
      agentName: 'Conclusion & Supplements Reviewer',
    }
    const venueComment = {
      highlightText: scope.highlightText,
      comment:
        'This limitations paragraph reports new results (91.2 F1 on XNLI) that belong in the main paper. Move them to Results; ARR can desk-reject papers that put main-paper content in Limitations.',
      severity: 'warning',
      category: 'venue',
      agentName: 'Venue Reviewer (acl_2026)',
    }

    it('keeps a scope comment and an unrelated grammar comment on overlapping text', function (ctx) {
      const grammar = {
        highlightText: 'reaches 91.2 F1 on XNLI',
        comment:
          'Grammar: use "achieves" instead of "reaches" when reporting a score.',
        severity: 'suggestion',
        category: 'writing_style',
        agentName: 'Writing Style Reviewer',
      }
      const result = ctx.module.deduplicateComments([scope, grammar], mergedTex)
      expect(result).toHaveLength(2)
      expect(result).toContain(scope)
    })

    it('keeps the critical scope comment over a similar venue warning', function (ctx) {
      const result = ctx.module.deduplicateComments(
        [venueComment, scope],
        mergedTex
      )
      expect(result).toEqual([scope])
    })

    it('keeps comments on non-overlapping text', function (ctx) {
      const other = {
        ...venueComment,
        highlightText: 'We only evaluate on English data.',
      }
      const result = ctx.module.deduplicateComments([scope, other], mergedTex)
      expect(result).toEqual([scope, other])
    })

    it('keeps a comment whose highlightText is not in the document', function (ctx) {
      const missing = {
        ...venueComment,
        highlightText: 'Table 5 reports 91.2 F1',
      }
      const result = ctx.module.deduplicateComments([scope, missing], mergedTex)
      expect(result).toEqual([scope, missing])
    })
  })

  describe('withConclusionVenue', function () {
    const conclusionOf = defs => defs.find(d => d.id === 'conclusion')

    it('names ACL Rolling Review for ARR venues', function (ctx) {
      for (const v of ['acl_2026', 'emnlp_2025', 'naacl_2027', 'eacl_2026']) {
        const p = conclusionOf(
          ctx.module.withConclusionVenue(ctx.module.SUBAGENT_DEFS, v)
        ).systemPreamble
        expect(p).toContain(`Target venue: ${v}`)
        expect(p).toContain('ACL Rolling Review')
      }
    })

    it('uses page-limit wording for other venues', function (ctx) {
      for (const v of [
        'arxiv',
        'aaai_2026',
        'iclr_2026',
        'neurips_2025',
        undefined,
      ]) {
        const p = conclusionOf(
          ctx.module.withConclusionVenue(ctx.module.SUBAGENT_DEFS, v)
        ).systemPreamble
        expect(p).toContain('page limit')
        expect(p).not.toContain('ACL Rolling Review')
      }
    })

    it('leaves SUBAGENT_DEFS and other defs untouched', function (ctx) {
      const { SUBAGENT_DEFS, withConclusionVenue } = ctx.module
      const saved = conclusionOf(SUBAGENT_DEFS).systemPreamble
      withConclusionVenue(SUBAGENT_DEFS, 'acl_2026')
      const result = withConclusionVenue(SUBAGENT_DEFS, 'neurips_2025')
      expect(conclusionOf(SUBAGENT_DEFS).systemPreamble).toBe(saved)
      const p = conclusionOf(result).systemPreamble
      expect(p).toContain('neurips_2025')
      expect(p).not.toContain('acl_2026')
      result.forEach((d, i) => {
        if (d.id !== 'conclusion') expect(d).toBe(SUBAGENT_DEFS[i])
      })
    })

    it('returns defs unchanged when conclusion is absent', function (ctx) {
      const { SUBAGENT_DEFS, withConclusionVenue } = ctx.module
      const defs = SUBAGENT_DEFS.filter(d => d.id !== 'conclusion')
      expect(withConclusionVenue(defs, 'acl_2026')).toEqual(defs)
    })

    it('static conclusion preamble points at the scope rule', function (ctx) {
      const p = conclusionOf(ctx.module.SUBAGENT_DEFS).systemPreamble
      expect(p).toContain('Scope Rule')
      expect(p).toContain('critical')
    })
  })
})
