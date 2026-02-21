# Finding Prototype Papers to Imitate

[TEXT — no multimodal needed]

Before giving writing suggestions on a section, the agent should find high-quality prototype papers to understand what good writing looks like for this paper's topic.

## Action 0: Check local review sets first

Before searching the web, check the curated review set JSON files in `review_sets/`. These files contain high-quality accepted papers with full reviewer feedback — providing a fast, reviewer-calibrated shortcut to strong examples.

**When to use:** If the paper's target venue is ICLR, NeurIPS, or COLM, always check the corresponding high-quality JSON first.

**How to use:** See `01_setup/review_sets_guide.md` for the full lookup workflow — keyword search, candidate selection, fetching papers via OpenReview links, and what to extract.

**Fallback:** If no topically relevant papers are found in the review sets (e.g., for other venues or niche topics), proceed to Actions 1–7 below.

---

## Action 1: Identify the paper's topic
- Identify the paper's topic, keywords, and target venue from the LaTeX source.

## Action 2: Web search for prototype papers
- Search Semantic Scholar (semanticscholar.org) or Google Scholar for papers on the topic from top venues.
- **Only imitate papers published at:** ACL, EMNLP, NAACL, NeurIPS, ICML, ICLR.
- Among these conference papers, use papers >=8 pages long.
- Use a different set of prototype papers for each section (e.g., when describing the dataset, the method, etc.).

## Action 3: Fetch and extract writing patterns from prototypes
- Fetch the relevant section from 2-3 top prototype papers.
- Identify structural patterns: paragraph count, sentence-level flow, how claims are supported.
- Summarize the writing pattern for reference when giving writing suggestions later.

## Action 4: Search for topic-specific survey papers
- Search for "{keyword} survey" or "{keyword} paper list github" to find comprehensive references.
- This helps verify whether the paper's related work coverage is adequate.

## Action 5: Check venue-specific accepted paper lists
- For NeurIPS/ICLR/ICML: search OpenReview accepted paper lists by keyword. OpenReview organizes papers by tabs (oral, spotlight, poster) with search functionality for each tab.
- For ACL/EMNLP/NAACL: search ACL Anthology (aclanthology.org) by keyword. ACL Anthology is a digital archive of 119,000+ papers on computational linguistics and NLP, with BibTeX downloads available for each paper.

## Action 6: Collect a superset of relevant papers (for literature review check)
Gather papers through multiple methods:
- **From search engine:** Use multiple keyword sets related to the topic.
- **From researcher names:** Search for key researchers in the area by name.
- **From publication venues:** Check paper lists from NeurIPS, ICLR, ICML, CLeaR, ACL, EMNLP, NAACL.

## Action 7: Filter collected papers by credibility
Signals of credibility:
- **Publication venue:** Top target conferences (ACL, EMNLP, NAACL, NeurIPS, ICML, ICLR).
- **High citations.**
- **Well-known researchers or institutions** for this research topic.

## Useful Tools for Literature Review

- **Allen AI search engine** (asta.allen.ai): AI-powered search for finding relevant research papers across venues.
- **CatalyzeX:** Browser extension (Chrome, Firefox, Edge) that helps find open-source code implementations for academic papers directly on Google, arXiv, Scholar, and Twitter.
- **DBLP** (dblp.org): Comprehensive computer science bibliography with 8.3+ million publications. Provides high-quality BibTeX entries in a standardized format — preferred over Google Scholar for bibliography entries.
- **ACL Anthology** (aclanthology.org): Primary archive for NLP papers. Provides complete BibTeX downloads and organized browsing by venue and year.
- **Google Scholar PDF Reader:** Browser extension for following references, skimming outlines, jumping to figures, and citing/saving papers.

## Completeness check
A good literature review is comprehensive enough that:
- The main approaches in each relevant sub-area are covered.
- The paper would not be surprised by reviewer suggestions of missing references.
