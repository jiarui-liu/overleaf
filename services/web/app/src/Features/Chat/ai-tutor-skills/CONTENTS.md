# ML Paper Writing Tutor — Skill Library

This skill library is consumed by `AiTutorReviewOrchestrator.mjs`, which runs a 6-phase review pipeline. Skill files are loaded via `loadSkill()` and injected into LLM system prompts as reference material for specialized reviewer subagents. Each file is tagged with its modality requirement:
- **[TEXT]** — can be applied by reading the LaTeX source only.
- **[MULTIMODAL]** — requires viewing compiled figures/tables/images.

### Review Pipeline Overview

1. **Section Parsing** — Extracts sections from merged LaTeX (no LLM).
2. **Paper Type Classification** — Loads `paper_type_definitions.md`; LLM classifies the paper and generates type-specific guidance.
3. **Parallel Reviewer Subagents** — 11 static agents (each with assigned skill files) + up to 2 dynamic agents (paper type, venue) run in parallel. Skill files are concatenated into each agent's system prompt under "Writing Skills Reference."
4. **Comment Deduplication** — Removes overlapping feedback across agents.
5. **Strict-Mode Pruning** — LLM selects top-N comments if count exceeds threshold.
6. **Position Mapping** — Maps comments back from merged.tex to original documents.

---

## 01_setup/ — Agent Setup & Classification

| File | Modality | Description |
|------|----------|-------------|
| `paper_type_definitions.md` | TEXT | **Used in Phase 2.** Defines 7 paper types (dataset, method_improvement, llm_engineering, llm_inference_findings, css, position, other) with descriptions and examples. Loaded as context for LLM classification. |
| `finding_prototype_papers.md` | TEXT | How to find prototype papers: check local review sets first, then web search top venues (≥8 pages), credibility filtering, useful tools (Allen AI, CatalyzeX, DBLP, ACL Anthology, Google Scholar PDF Reader) |
| `example_papers_guide.md` | TEXT+MULTIMODAL | Index of 32 downloaded example papers in `example_papers/`, organized by section/paper type, with what to study in each |
| `review_sets_guide.md` | TEXT | How to search the curated review set JSON files to find topically relevant high-quality accepted papers; lookup workflow, what to extract, and how to use the low-quality set as a negative reference |

---

## 02_venues/ — Target Venue Guidelines

Venue-specific submission requirements and reviewer criteria. When a venue other than arxiv is selected, a **dynamic Venue Reviewer subagent** is created and loaded with the corresponding file.

| File | Modality | Description |
|------|----------|-------------|
| `arxiv_default.md` | TEXT | No specific venue; general ML best practices apply |
| `colm_2026.md` | TEXT | COLM 2026: 9 pages, 6 reviewer dimensions |
| `icml_2026.md` | TEXT | ICML 2026: 8 pages, mandatory impact statement, 4 dimensions |
| `acl_2026.md` | TEXT | ACL 2026: 8/4 pages, ARR system, required Limitations section |
| `aaai_2026.md` | TEXT | AAAI 2026: 7 pages, required Reproducibility Checklist, two-phase review |
| `iclr_2026.md` | TEXT | ICLR 2026: 9 pages, 4 reviewer questions, rating 0–10 |
| `emnlp_2025.md` | TEXT | EMNLP 2025: 8/4 pages, ARR system, NLP focus |
| `neurips_2025.md` | TEXT | NeurIPS 2025: 9 pages, required checklist, 4 dimensions, 1–6 scale |

---

## 03_paper_types/ — Paper Type Guidance

After Phase 2 classification, a **dynamic Paper Type Reviewer subagent** is created and loaded with the matching file.

| File | Modality | Description |
|------|----------|-------------|
| `analysis_paper.md` | TEXT | References results_and_analysis.md for RQ structure |
| `dataset_paper.md` | TEXT | Reviewer criteria, data collection writing guide, dataset comparison |
| `method_improvement_paper.md` | TEXT | Baseline statement, design choice justification, ablation studies, fair comparisons |
| `llm_inference_findings_paper.md` | TEXT | Multiple analysis sections, RQ-driven structure, bold findings |
| `llm_engineering_paper.md` | TEXT | Problem statement → multi-aspect solutions → empirical gains structure |
| `css_paper.md` | TEXT | Social science grounding, data collection, publication venues |
| `position_paper.md` | TEXT | Type 1: model/hypothesis + case studies. Type 2: organized arguments |

---

## 04_paper_sections/ — Section-by-Section Writing Guide

Each file is assigned to one or more **static reviewer subagents** that review the corresponding section.

| File | Used by Agent(s) | Modality | Description |
|------|-------------------|----------|-------------|
| `abstract.md` | `abstract` | TEXT | 5-sentence structure, matryoshka doll principle, annotated example, improvement prompt |
| `introduction.md` | `introduction` | TEXT | 5-question/4-paragraph structure, storytelling, contributions list, annotated example |
| `task_formulation.md` | `methods` | TEXT | When to include, what it covers (problem setting, notation, assumptions) |
| `related_work.md` | `related_work` | TEXT | "History book" paragraph structure, compare and contrast, academic siblings |
| `methods.md` | `methods` | TEXT | Page budget, background vs methods, pseudo-code, design choice justification, intuition before formalism |
| `results_and_analysis.md` | `results` | TEXT+MULTIMODAL | Experimental setup, RQ structures, Finding 1/2/3 pattern, subsection styles |
| `conclusion.md` | `conclusion` | TEXT | Structure (what solved + next steps), don't repeat abstract/intro |
| `limitations.md` | `conclusion` | TEXT | *Placeholder* |
| `ethical_considerations.md` | `conclusion` | TEXT | ACL Ethics FAQ guidelines, ethics review process |
| `faq_appendix.md` | `appendix` | TEXT | Why include a FAQ, anticipate reviewer questions |

---

## 05_figures_and_tables/ — Visual Elements

| File | Used by Agent(s) | Modality | Description |
|------|-------------------|----------|-------------|
| `figure1_design.md` | `figures_tables` | MULTIMODAL | Tools (draw.io), design principles, font size rule, color usage |
| `experiment_visualization.md` | `figures_tables` | MULTIMODAL | One key message per figure, chart type, data ordering, numeric precision |
| `color_palettes.md` | — | MULTIMODAL | Nature-style palettes, colorblind accessibility, grayscale fallback |
| `data_visualization.md` | — | MULTIMODAL | Dataset paper visuals: 3 required elements |
| `table_formatting.md` | `latex_formatting` | TEXT+MULTIMODAL | No vertical bars, booktabs LaTeX template |
| `caption_writing.md` | `figures_tables` | TEXT | Self-contained captions, first sentence as statement |

---

## 06_writing_style/ — Formatting and Language

| File | Used by Agent(s) | Modality | Description |
|------|-------------------|----------|-------------|
| `grammar_and_punctuation.md` | `writing_style` | TEXT | Tense, pronoun clarity, active voice, filler words, conciseness, formality |
| `citations_and_references.md` | `related_work`, `writing_style` | TEXT | \citet vs \citep, citation framing, reference priority, BibTeX |
| `latex_formatting.md` | `latex_formatting` | TEXT | Cleveref, acronym packages, anonymous submission, quotation marks, hyperref |
| `math_and_formulas.md` | `methods`, `latex_formatting` | TEXT | \mathrm/\bm/\top, equations as sentences, notation consistency, macros |
| `capitalization_and_acronyms.md` | `writing_style` | TEXT | Lowercase ML terms, abbreviation rules, title vs. sentence capitalization |
| `general_writing_habits.md` | `writing_style` | TEXT | Write early, outline method, one key idea, terminology consistency, elevator pitch |

---

## example_papers/ — Role Model Papers

32 PDFs used as structural/style references. Optionally injected into subagent prompts with agent-specific study hints. See `01_setup/example_papers_guide.md` for the full index mapping papers to sections and writing patterns.

Also contains `download_papers.sh` for fetching papers by arXiv ID.

---

## review_sets/ — Curated Review Datasets

JSON files containing accepted papers from recent top conferences, with full reviewer feedback (scores, strengths, weaknesses). Used to find topically relevant example papers before web searching. See `01_setup/review_sets_guide.md` for the lookup workflow.

| File | Coverage | Papers |
|------|----------|--------|
| `ICLR2025_50_high_quality_papers.json` | ICLR 2025 — high quality | 50 papers (avg score >8) |
| `ICLR2025_50_low_quality_papers.json` | ICLR 2025 — low quality | 50 papers (negative reference) |
| `NeurIPS2025_100_high_quality_papers.json` | NeurIPS 2025 — high quality | 100 papers |
| `NeurIPS2025_100_low_quality_papers.json` | NeurIPS 2025 — low quality | 100 papers (negative reference) |
| `COLM2025_50_high_quality_papers.json` | COLM 2025 — high quality | 50 papers |
