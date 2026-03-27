# Section-to-Agent Classification Examples

This document shows how `parseSections()` breaks each paper into non-overlapping sections, and how the Phase 1 LLM classifier would assign each section to one of the 7 review categories: **abstract**, **introduction**, **related_work**, **methods**, **results**, **conclusion**, **appendix**.

Sections at levels 1-2 (`\section`, `\subsection`) are independently assigned. Level-3 sections (`\subsubsection`) are included in their parent `\subsection` and not independently assigned.

After assignment, each category's sections are sent to the corresponding reviewer agent. Full-document agents (writing style, LaTeX, figures, structure) receive `merged.tex` directly and are not affected by this classification.

---

## Paper 1: Stabilizing RL for Honesty Alignment (method_improvement)

86,863 chars | 27 sections parsed

| Level | Section Title | Chars | Category |
|-------|--------------|-------|----------|
| L0 | Abstract | 1,680 | **abstract** |
| L1 | Introduction | 8,147 | **introduction** |
| L1 | Deductive Reasoning Dataset Construction | 7,458 | **methods** |
| L1 | RQ1 (Motivation): How Do Untrained Models Perform on Reasoning Tasks of Varying Deductive Difficulty? | 6,278 | **results** |
| L1 | RQ2 (Core Problem): How Can Training Equip Models with Honest Reasoning Abilities? | 585 | **methods** |
| L2 | &nbsp;&nbsp;Preliminaries | 1,400 | **methods** |
| L2 | &nbsp;&nbsp;Methodology: \methodname | 3,708 | **methods** |
| L1 | Experiments | 8,435 | **results** |
| L1 | Discussion | 3,233 | **results** |
| L1 | Conclusion | 963 | **conclusion** |
| L1 | Ethics Statement | 795 | **conclusion** |
| L1 | Reproducibility Statement | 767 | **conclusion** |
| L1 | Related Work | 50 | **related_work** |
| L2 | &nbsp;&nbsp;Stabilizing Reinforcement Learning | 10,736 | **related_work** |
| L2 | &nbsp;&nbsp;Honesty Alignment | 2,441 | **related_work** |
| L1 | Limitations | 1,236 | **conclusion** |
| L1 | Dataset Details | 27 | **appendix** |
| L2 | &nbsp;&nbsp;Linear Algebra | 127 | **appendix** |
| L2 | &nbsp;&nbsp;Logical Inference | 2,419 | **appendix** |
| L1 | RQ1 | 15 | **appendix** |
| L2 | &nbsp;&nbsp;Experiment Setup | 1,079 | **appendix** |
| L1 | RQ2: Additional Preliminaries | 41 | **appendix** |
| L2 | &nbsp;&nbsp;GRPO | 1,150 | **appendix** |
| L2 | &nbsp;&nbsp;SFT | 515 | **appendix** |
| L1 | Proof of Proposition 1 | 2,852 | **appendix** |
| L1 | Experiment Setup | 3,999 | **appendix** |
| L1 | Clarifications on LLM Usage | 143 | **appendix** |

### Agent Input Summary

| Agent | Sections Received | Total Chars |
|-------|------------------|-------------|
| Abstract Reviewer | Abstract | 1,680 |
| Introduction Reviewer | Introduction | 8,147 |
| Related Work Reviewer | Related Work (preamble) + Stabilizing RL + Honesty Alignment | 13,227 |
| Methods Reviewer | Dataset Construction + RQ2 (preamble) + Preliminaries + Methodology | 13,151 |
| Results Reviewer | RQ1 + Experiments + Discussion | 17,946 |
| Conclusion Reviewer | Conclusion + Ethics + Reproducibility + Limitations | 3,761 |
| Appendix Reviewer | Dataset Details + Linear Algebra + Logical Inference + RQ1 + Experiment Setup + RQ2 Additional + GRPO + SFT + Proof + Experiment Setup + LLM Usage | 12,367 |

**No overlap**: each char range appears in exactly one agent.

---

## Paper 2: Preserving Historical Truth (dataset)

99,683 chars | 31 sections parsed

| Level | Section Title | Chars | Category |
|-------|--------------|-------|----------|
| L0 | Abstract | 1,753 | **abstract** |
| L1 | Introduction | 5,076 | **introduction** |
| L1 | Related Work | 3,985 | **related_work** |
| L1 | Dataset Construction | 10,041 | **methods** |
| L1 | LLM Testing Pipeline | 934 | **methods** |
| L2 | &nbsp;&nbsp;Prompt Generation | 6,067 | **methods** |
| L2 | &nbsp;&nbsp;LLM Inference | 781 | **methods** |
| L2 | &nbsp;&nbsp;Evaluation Metrics | 3,391 | **methods** |
| L2 | &nbsp;&nbsp;Prompt Robustness Extension | 650 | **methods** |
| L1 | Results | 286 | **results** |
| L2 | &nbsp;&nbsp;RQ1: Do LLMs exhibit historical revisionism? | 7,679 | **results** |
| L2 | &nbsp;&nbsp;RQ2: Does revisionism depend on user interaction? | 5,050 | **results** |
| L2 | &nbsp;&nbsp;RQ3: How robust are LLMs when explicitly prompted...? | 3,597 | **results** |
| L1 | Validation and Robustness | 438 | **results** |
| L2 | &nbsp;&nbsp;Judge Model Agreement | 1,683 | **results** |
| L2 | &nbsp;&nbsp;Qualitative Analysis of Judges | 1,787 | **results** |
| L1 | Conclusion | 1,566 | **conclusion** |
| L1 | Limitations | 1,124 | **conclusion** |
| L1 | Ethical Consideration | 2,698 | **conclusion** |
| L1 | Acknowledgment | 2,996 | **conclusion** |
| L1 | Country Distribution Table | 1,140 | **appendix** |
| L1 | Country-Period Distribution Table | 879 | **appendix** |
| L1 | Revisionism Stages and Prompt Types | 1,305 | **appendix** |
| L1 | Example of HistoricalMisinfo | 2,991 | **appendix** |
| L1 | Revisionist Score across Scenario and Model... | 1,838 | **appendix** |
| L1 | Scenario-Based Prompt Templates | 1,799 | **appendix** |
| L1 | Scenario-Based Revisionist Prompt Templates | 2,248 | **appendix** |
| L1 | Judging Prompt Template | 16,601 | **appendix** |
| L1 | Examples of Model Responses and LLM-as-a-Judge Assessments | 1,895 | **appendix** |
| L1 | Computational Resources | 201 | **appendix** |
| L1 | List of LLM used for generating the response | 641 | **appendix** |
| L1 | License | 1,388 | **appendix** |

### Agent Input Summary

| Agent | Sections Received | Total Chars |
|-------|------------------|-------------|
| Abstract Reviewer | Abstract | 1,753 |
| Introduction Reviewer | Introduction | 5,076 |
| Related Work Reviewer | Related Work | 3,985 |
| Methods Reviewer | Dataset Construction + LLM Testing Pipeline (preamble) + Prompt Generation + LLM Inference + Evaluation Metrics + Prompt Robustness Extension | 21,864 |
| Results Reviewer | Results (preamble) + RQ1 + RQ2 + RQ3 + Validation and Robustness (preamble) + Judge Model Agreement + Qualitative Analysis of Judges | 20,520 |
| Conclusion Reviewer | Conclusion + Limitations + Ethical Consideration + Acknowledgment | 8,384 |
| Appendix Reviewer | Country Distribution + Country-Period Distribution + Revisionism Stages + Example + Revisionist Scores + Scenario Prompt Templates + Revisionist Prompt Templates + Judging Prompt Template + Model Response Examples + Computational Resources + LLMs Used + License | 32,926 |

**No overlap**: each char range appears in exactly one agent.

---

## Paper 3: Mind the Sim2Real Gap (llm_inference_findings)

53,649 chars | 25 sections parsed

| Level | Section Title | Chars | Category |
|-------|--------------|-------|----------|
| L0 | Abstract | 1,765 | **abstract** |
| L1 | Introduction | 5,912 | **introduction** |
| L1 | Related Work | 49 | **related_work** |
| L2 | &nbsp;&nbsp;LLM-based agent benchmarks | 1,208 | **related_work** |
| L2 | &nbsp;&nbsp;User simulation for dialogue and agents | 947 | **related_work** |
| L2 | &nbsp;&nbsp;Evaluation of AI agents | 797 | **related_work** |
| L2 | &nbsp;&nbsp;Concurrent work | 872 | **related_work** |
| L1 | Methodology | 47 | **methods** |
| L2 | &nbsp;&nbsp;Benchmark overview | 1,072 | **methods** |
| L2 | &nbsp;&nbsp;Taxonomy of Sim2Real gaps | 3,315 | **methods** |
| L2 | &nbsp;&nbsp;Human annotation design | 1,576 | **methods** |
| L2 | &nbsp;&nbsp;Statistical framework | 2,864 | **methods** |
| L1 | Results: Simulator as Interactive User | 259 | **results** |
| L2 | &nbsp;&nbsp;Tau Bench: Behavioral divergence | 6,071 | **results** |
| L1 | Results: Simulator as Evaluator | 234 | **results** |
| L2 | &nbsp;&nbsp;Tau Bench: Human vs. LLM evaluator | 3,527 | **results** |
| L2 | &nbsp;&nbsp;Tau Bench: Is automatic evaluation enough? | 5,769 | **results** |
| L1 | Discussion | 4,239 | **results** |
| L1 | Conclusion | 1,491 | **conclusion** |
| L1 | Acknowledgments | 202 | **conclusion** |
| L1 | Annotation Details | 769 | **appendix** |
| L2 | &nbsp;&nbsp;Task filtering criteria | 161 | **appendix** |
| L2 | &nbsp;&nbsp;Survey (Tau Bench) | 2,928 | **appendix** |
| L2 | &nbsp;&nbsp;Detailed behavioral divergence metrics | 1,867 | **appendix** |
| L2 | &nbsp;&nbsp;Operational definitions of behavioral metrics | 3,976 | **appendix** |
| L2 | &nbsp;&nbsp;Example interactions | 289 | **appendix** |

### Agent Input Summary

| Agent | Sections Received | Total Chars |
|-------|------------------|-------------|
| Abstract Reviewer | Abstract | 1,765 |
| Introduction Reviewer | Introduction | 5,912 |
| Related Work Reviewer | Related Work (preamble) + LLM-based agent benchmarks + User simulation + Evaluation of AI agents + Concurrent work | 3,873 |
| Methods Reviewer | Methodology (preamble) + Benchmark overview + Taxonomy of Sim2Real gaps + Human annotation design + Statistical framework | 8,874 |
| Results Reviewer | Results: Simulator as Interactive User (preamble) + Tau Bench: Behavioral divergence + Results: Simulator as Evaluator (preamble) + Human vs. LLM evaluator + Is automatic evaluation enough? + Discussion | 20,099 |
| Conclusion Reviewer | Conclusion + Acknowledgments | 1,693 |
| Appendix Reviewer | Annotation Details (preamble) + Task filtering criteria + Survey + Detailed behavioral divergence metrics + Operational definitions + Example interactions | 9,990 |

**No overlap**: each char range appears in exactly one agent.

---

## How Section Classification Works

1. **Phase 0** — `parseSections()` extracts all `\section`, `\subsection`, and `\subsubsection` headers via regex. Each section's content spans from its header to the next independently-assignable header (level ≤ 2), ensuring **no overlapping text** between sections at levels 1-2. Level-3 sections (`\subsubsection`) are included within their parent `\subsection`.

2. **Phase 1** — The LLM classifier sees all level 1-2 section titles and assigns each to exactly one of the 7 categories. The Zod schema enforces that every section gets assigned. A keyword-based fallback catches any sections the LLM misses.

3. **Phase 2** — Each section-specific agent receives only the concatenated text of its assigned sections. Full-document agents (Writing Style, LaTeX, Figures, Structure, Paper Type, Venue) receive `merged.tex` directly.

### Note on "Preamble" Sections

When a `\section{Methods}` has `\subsection` children, the `\section` entry only captures the introductory text before the first `\subsection` (the "preamble"). This is often just 1-2 sentences. The subsections are assigned independently. If all subsections are assigned to the same category as the parent, the agent still receives the full content (preamble + all subsections concatenated).
