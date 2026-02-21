# ML Paper Writing Tutor — Skill Library

This skill library is given to an LLM agent that reviews Overleaf papers and leaves inline writing suggestions. Each file is tagged with its modality requirement:
- **[TEXT]** — can be applied by reading the LaTeX source only.
- **[MULTIMODAL]** — requires viewing compiled figures/tables/images.

---

## 01_setup/ — Agent Setup Actions

Actions the agent should take before giving writing suggestions (e.g., web search, fetching prototype papers).

| File | Modality | Description |
|------|----------|--------------|
| `finding_prototype_papers.md` | TEXT | **Action 0:** Check local review sets first; then web search for prototype papers from top venues (>=8 pages), literature review completeness check, filtering by credibility, useful tools (Allen AI, CatalyzeX, DBLP, ACL Anthology, Google Scholar PDF Reader) |
| `example_papers_guide.md` | TEXT+MULTIMODAL | Index of 34 downloaded example papers in `example_papers/`, organized by section/paper type, with what to study in each |
| `review_sets_guide.md` | TEXT | How to search the curated review set JSON files to find topically relevant high-quality accepted papers; lookup workflow, what to extract from strong examples, and how to use the low-quality set as a negative reference |

---

## 02_venues/ — Target Venue Guidelines

Venue-specific submission requirements, page limits, required sections, and reviewer evaluation criteria. When a venue is selected, a dedicated Venue Reviewer subagent is added to check the paper against that venue's specific expectations.

| File | Modality | Description |
|------|----------|-------------|
| `arxiv_default.md` | TEXT | No specific venue; general ML best practices apply |
| `colm_2026.md` | TEXT | COLM 2026: 9 pages, 6 reviewer dimensions (Empiricism, Impact, Ambition, Understanding, Clarity, Reproducibility) |
| `icml_2026.md` | TEXT | ICML 2026: 8 pages, mandatory impact statement, 4 dimensions (Soundness, Presentation, Significance, Originality) |
| `acl_2026.md` | TEXT | ACL 2026: 8/4 pages, ARR system, required Limitations section, scores: Soundness, Excitement, Overall |
| `aaai_2026.md` | TEXT | AAAI 2026: 7 pages, required Reproducibility Checklist, two-phase review with AI supplement |
| `iclr_2026.md` | TEXT | ICLR 2026: 9 pages, 4 reviewer questions (Problem, Motivation, Evidence, Significance), rating 0–10 |
| `emnlp_2025.md` | TEXT | EMNLP 2025: 8/4 pages, ARR system, NLP focus, required Limitations, scores: Soundness, Excitement, Overall |
| `neurips_2025.md` | TEXT | NeurIPS 2025: 9 pages, required checklist, 4 dimensions (Quality, Clarity, Significance, Originality), 1–6 scale |

---

## 03_paper_types/ — Paper Type Identification

Identify what type of paper is being written, then apply type-specific structural guidance.

| File | Modality | Description |
|------|----------|-------------|
| `analysis_paper.md` | TEXT | References results_and_analysis.md for RQ structure |
| `dataset_paper.md` | TEXT | Reviewer criteria (6 points), data collection writing guide, dataset comparison |
| `method_improvement_paper.md` | TEXT | Baseline statement, design choice justification, ablation studies, fair comparisons |
| `llm_inference_findings_paper.md` | TEXT | Paper type definition, multiple analysis sections, RQ-driven structure, bold findings |
| `llm_engineering_paper.md` | TEXT | Problem statement → multi-aspect solutions → empirical gains structure |
| `css_paper.md` | TEXT | CSS paper definition, social science grounding, data collection, publication venues |
| `position_paper.md` | TEXT | Type 1: model hypothesis + case studies. Type 2: collection of opinions, flat structure |

---

## 04_paper_sections/ — Section-by-Section Writing Guide

Detailed guidance for writing each section, including improvement prompting templates where applicable.

| File | Modality | Description |
|------|----------|-------------|
| `abstract.md` | TEXT | 5-sentence structure, matryoshka doll principle, general tips (describe work not paper, be specific), annotated example, improvement prompt template |
| `introduction.md` | TEXT | Critical importance, WHAT-WHY-HOW figures, 5-question/4-paragraph structure, storytelling approach, contributions list, full annotated example, improvement prompt template |
| `task_formulation.md` | TEXT | When to include, what it covers (problem setting, notation, assumptions), novel problem settings |
| `related_work.md` | TEXT | "History book" paragraph structure, ingredient gathering, compare and contrast, academic siblings concept, placement advice, improvement prompt template |
| `methods.md` | TEXT | Page budget (start by p2-3), questions to address, background vs methods, pseudo-code readability, design choice justification, intuition before formalism, running examples, top-down descriptions, notation, linear flow |
| `results_and_analysis.md` | TEXT+MULTIMODAL | Experimental setup template, single vs. multiple result sections, RQ structures, Answer/Elaboration vs Question/Answer subsection styles, Finding 1/2/3 pattern, what to measure, important considerations |
| `conclusion.md` | TEXT | Structure (what solved + next steps), keep brief, don't repeat abstract/intro, bullet-list future work |
| `limitations.md` | TEXT | *Placeholder* |
| `ethical_considerations.md` | TEXT | Format, ACL Ethics FAQ guidelines (ethics review process, dataset papers, NLP applications, demographic data, computational costs) |
| `faq_appendix.md` | TEXT | Why include a FAQ, how to write it (anticipate reviewer questions, clear Q&A format) |

---

## 05_figures_and_tables/ — Visual Elements

Guidance on creating and reviewing figures, tables, and their captions.

| File | Modality | Description |
|------|----------|-------------|
| `figure1_design.md` | MULTIMODAL | Tools (draw.io), export format, design principles (self-contained, sketch first, label generously), font size rule, color usage, figure placement |
| `experiment_visualization.md` | MULTIMODAL | Plan figures early, one key message per figure, improving tables & figures, data ordering, chart type appropriateness, numeric precision, visual clutter, visualization tools (D3.js) |
| `color_palettes.md` | MULTIMODAL | Nature-style palettes, ColorBrewer/Tachyons tools, colorblind accessibility, contrast, grayscale fallback |
| `data_visualization.md` | MULTIMODAL | Dataset paper visuals: 3 required elements |
| `table_formatting.md` | TEXT+MULTIMODAL | No vertical bars, booktabs LaTeX template |
| `caption_writing.md` | TEXT | Abbreviation rule, self-contained captions, first sentence as statement (not description), explaining figures/tables in text |

---

## 06_writing_style/ — Formatting and Language

Rules and conventions for professional academic writing.

| File | Modality | Description |
|------|----------|-------------|
| `grammar_and_punctuation.md` | TEXT | Spacing, footnotes, tense, pronoun clarity, that/which, active vs passive voice, filler words, conciseness, vague language, bold/italic usage, plagiarism, formality, numbers, American/British English, grammar tools |
| `citations_and_references.md` | TEXT | Reference priority, BibTeX alias, \citet vs \citep, citation framing, citation grammar, quotation vs paraphrase, completeness, management tools |
| `latex_formatting.md` | TEXT | Cleveref, acronym packages, section ordering, anonymous submission rules, quotation marks, hyperref backref, automatic numbering, positional references, proofread PDF, fill page limit, appendix content |
| `math_and_formulas.md` | TEXT | \mathrm/\bm/\top, formula numbering, equations as sentences, style tips, readability (notation with names, consistency, simplify, macros), punctuation, variable definitions |
| `capitalization_and_acronyms.md` | TEXT | Lowercase ML terms, abbreviation rules, title vs. sentence capitalization |
| `general_writing_habits.md` | TEXT | Writing as thinking, write early, shitty first draft, outline method, first sentences tell story, elevator pitch, one key idea, every section tells a story, contributions clarity, terminology consistency, scientific claims, headings, put readers first, listen to readers, fresh perspective |

---

## review_sets/ — Curated Review Datasets

JSON files containing accepted papers from recent top conferences, with full reviewer feedback (scores, strengths, weaknesses). Used by the agent to find topically relevant **high-quality example papers** before web searching. See `01_setup/review_sets_guide.md` for the lookup workflow.

| File | Coverage | Papers |
|------|----------|---------|
| `ICLR2025_50_high_quality_papers.json` | ICLR 2025 — high quality | 50 papers (avg score >8, mostly Oral/Spotlight) |
| `ICLR2025_50_low_quality_papers.json` | ICLR 2025 — low quality | 50 papers (lower scores; use as negative reference) |
| `NeurIPS2025_100_high_quality_papers.json` | NeurIPS 2025 — high quality | 100 papers |
| `NeurIPS2025_100_low_quality_papers.json` | NeurIPS 2025 — low quality | 100 papers (lower scores; use as negative reference) |
| `COLM2025_50_high_quality_papers.json` | COLM 2025 — high quality | 50 papers |
