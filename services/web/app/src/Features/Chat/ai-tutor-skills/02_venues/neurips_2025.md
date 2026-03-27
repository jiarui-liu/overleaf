# NeurIPS 2025 — Neural Information Processing Systems

## Page Limits
- **Main paper:** 9 pages maximum (including figures and tables)
- **References:** Unlimited, do not count toward limit
- **Paper Checklist:** Does NOT count toward limit
- **Technical appendices:** Unlimited, optional, do NOT count toward limit
- **Camera-ready:** One additional page (total 10 pages)

## Required Sections
- Abstract
- Main paper body
- **NeurIPS Paper Checklist (REQUIRED)** — addressing reproducibility, transparency, and societal impact
- References
- Optional technical appendices

## Paper Checklist Contents
The required checklist addresses:
- Claims and experimental results
- Limitations of the work
- Theory and proof completeness
- Code and data availability
- Experimental setup (compute, seeds, hyperparameters)
- Societal impacts and ethics considerations

## Formatting
- **NeurIPS 2025 LaTeX style file** (mandatory)
- **Double-blind:** no identifying information in supplementary or external links

## Reviewer Evaluation Criteria (Four Dimensions)

1. **Quality** — Technical soundness, claim support through theory or experiments, methodology appropriateness. Reviewers expect honest assessment of strengths and weaknesses. Do not overstate contributions.

2. **Clarity** — Clear writing, good organization, sufficient detail for expert reproducibility. NeurIPS explicitly states: "A superbly written paper provides enough information for an expert reader to reproduce its results."

3. **Significance** — Community impact, likelihood of adoption, advancement over prior work. Papers should provide "unique data, unique conclusions about existing data, or a unique theoretical or experimental approach."

4. **Originality** — Novel insights, improved efficiency/fairness, new understanding. Does not require entirely novel methods, but must provide new knowledge.

## Scoring (1–6 Scale)
- 6 Strong Accept — Groundbreaking, technically flawless
- 5 Accept — Technically solid, high impact
- 4 Borderline Accept — Solid with limited evaluation
- 3 Borderline Reject — Solid but rejection reasons outweigh
- 2 Reject — Technical flaws or weak evaluation
- 1 Strong Reject — Well-known results or unaddressed ethics

## Common Writing-Related Rejection Reasons
- Missing or incomplete NeurIPS Checklist
- Critical results only in appendix, not summarized in main paper
- Insufficient reproducibility information
- Claims not supported by rigorous experiments
- No comparison to relevant baselines or ablations
- Ethics and societal impact not addressed
- Overstating significance

## High-Quality Example Papers (Review Sets)

Before reviewing a paper targeting NeurIPS, consult the curated review set JSON file to find **topically similar, highly-rated accepted papers** as reference points.

| File | Use For |
|------|---------|
| `review_sets/NeurIPS2025_100_high_quality_papers.json` | Find strong examples — 100 high-quality NeurIPS 2025 accepts |
| `review_sets/NeurIPS2025_100_low_quality_papers.json` | Identify common weaknesses reviewers flag — use as a negative reference |

**How to use:** Scan titles and abstracts for keyword overlap with the paper under review. Select 2–3 topically relevant entries with the highest `review scores`. Fetch them via their `link` (OpenReview URL) and study their structure, writing quality, and experimental design. Read the `strengths` field to understand what NeurIPS reviewers praised, and the `weaknesses` field to capture patterns to avoid.

See `01_setup/review_sets_guide.md` for the full lookup workflow.
