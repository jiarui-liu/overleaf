# AI Tutor — Multi-Agent Paper Review System

## Overview

The AI Tutor is an Overleaf plugin that provides automated paper review using a multi-agent architecture. It analyzes the full project structure, classifies the paper type, and runs parallel reviewer subagents — each specialized in a different aspect of academic writing — then deduplicates overlapping comments and posts inline comments to the Overleaf review panel. Users can optionally target a specific venue for venue-aware feedback and upload role model PDFs for structure/style comparison.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                          │
│  ai-tutor-panel.tsx                                         │
│  ┌────────────┐  ┌─────────┐  ┌────────────────┐           │
│  │ Model      │  │ Target  │  │ Role Model     │           │
│  │ Dropdown   │  │ Venue   │  │ PDFs (0-3)     │           │
│  └────────────┘  └─────────┘  └──────┬─────────┘           │
│       │               │              │ pdfjs-dist           │
│       │               │         extract-pdf-text.ts         │
│  ┌────▼───────────────▼──────────────▼──────────────────┐   │
│  │ Run Full Review                                      │   │
│  └──────────────────────┬───────────────────────────────┘   │
│                         │                                   │
│  ┌──────────────────────▼───────────────────────────────┐   │
│  │ Apply Comments to All Files   │  Delete All Comments │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                  POST /ai-tutor-review
                  (model, venue, roleModelTexts)
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                    Backend (Node.js)                          │
│  ChatController.mjs — reviewWholeProject()                   │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ 1. Inline-expand all \input/\include → merged.tex        ││
│  │ 2. Categorize files → metadata.json                      ││
│  │ 3. Save role model text to cache                         ││
│  │ 4. Call AiTutorReviewOrchestrator.runFullReview()         ││
│  │                                                          ││
│  │  Phase 1: parseSections()     — regex, no LLM            ││
│  │  Phase 2: classifyPaper()     — 1 LLM call               ││
│  │  Phase 3: runSubagent() × 10-12+ — parallel LLM calls    ││
│  │           (10 static + paper type + venue + hybrids)      ││
│  │  Phase 4: deduplicateComments() — overlap + similarity    ││
│  │  Phase 5: pruneCommentsWithLLM() — strict mode top-30     ││
│  │  Phase 6: mapCommentsToDocuments() — exact + fuzzy match  ││
│  │                                                          ││
│  │ 5. Log results to JSONL + cache review_comments.json      ││
│  └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

## Pipeline Phases

### Phase 1 — Section Parsing (regex, no LLM)

Parses `merged.tex` into a structured list of sections using regex:
- Extracts `\begin{abstract}...\end{abstract}`
- Detects `\appendix` boundary position — all `\section` headers after this point are flagged `isAppendix: true`
- Finds all `\section{}`, `\subsection{}`, `\subsubsection{}` headers
- For each header, captures the content until the next same-or-higher-level header
- Returns: `{ title, level, content, charStart, charEnd, isAppendix }[]`

**Design choice**: Regex is deterministic, free, and fast. LLM section parsing would be unreliable and unnecessary since LaTeX sections are well-structured.

**Design choice**: Appendix detection uses the structural `\appendix` LaTeX command rather than title-based heuristics. Section titles after `\appendix` (e.g., "Dataset Details", "Proof of Proposition 1") don't contain the word "appendix", so title matching would misclassify them into methods/results agents.

### Phase 2 — Paper Type Classification + Section Assignment (1 LLM call)

Uses `generateObject()` with a Zod schema to classify the paper and produce:
1. **paperType** — one of: `analysis`, `dataset`, `method_improvement`, `llm_engineering`, `llm_inference_findings`, `css`, `position`, `other`
2. **sectionAssignments** — an array with one entry per section: `{ sectionTitle, categories }`. Each section gets an array of 1-2 categories (multi-label, but strongly preferring single). Categories are: `abstract`, `introduction`, `related_work`, `methods`, `results`, `conclusion`, `appendix`. Appendix sections (detected structurally via `\appendix` in Phase 1) are excluded from the LLM prompt and auto-assigned to the `appendix` category. After the LLM responds, `buildSectionMapping()` inverts this into the category→titles map the subagents expect: single-category sections go to the normal mapping, while multi-category sections are collected into a `hybridSections` array for hybrid agent creation. A safety-net fallback assigns any sections the LLM missed using keyword heuristics.
3. **typeSpecificGuidance** — dynamically generated review criteria specific to this paper type, with keyed entries for individual agents (`abstractFocus`, `introductionFocus`, `methodsFocus`, `resultsFocus`, `overallNotes`). These are injected into every static agent's system prompt: agents with a matching `guidanceKey` receive their targeted guidance, and all agents additionally receive `overallNotes` as general type context.

The classifier receives the **full abstract**, **full introduction**, the section outline, and a numbered list of all sections to assign. All 7 paper type skill files from `03_paper_types/` are loaded into the system prompt. No content is pre-truncated — if the input exceeds the model's context window, `generateObjectWithRetry()` automatically retries with progressively shorter prompts (see [Context Length Handling](#context-length-handling)).

**Design choice**: Per-section assignment (section→categories) instead of per-category arrays (category→sections) ensures no section is accidentally left unreviewed. The LLM must produce an assignment for every section in the numbered list.

**Design choice**: Multi-label classification (max 2 categories per section) handles rare sections that genuinely span two concerns (e.g., a "Methods and Results" section). The LLM is prompted to strongly prefer single categories — in practice, gpt-4.1-mini consistently chooses single categories across all tested papers.

**Design choice**: The section mapping is produced by the LLM (not hardcoded regex) because section titles vary wildly across papers (e.g., "RQ1: How Can Training Equip Models..." is a results section, but regex wouldn't know that). The LLM sees the outline and classifies each section correctly.

**Design choice**: Type-specific guidance is generated dynamically rather than using fixed templates, because the Phase 2 LLM can tailor criteria to the specific paper (e.g., for a dataset paper about crowdsourcing, it might emphasize IAA reporting, while a dataset paper about web scraping would emphasize licensing).

### Phase 3 — Parallel Reviewer Subagents (10-12+ LLM calls)

All subagents run concurrently via `Promise.allSettled()` with 2-minute timeouts. There are 10 static agents plus up to 2 dynamic agents (paper type + venue) and optionally hybrid agents for multi-category sections:

#### Static Agents (10)

| # | Agent | Input | Skills |
|---|-------|-------|--------|
| 1 | Abstract Reviewer | Abstract section | `abstract.md` |
| 2 | Introduction Reviewer | Introduction section | `introduction.md` |
| 3 | Related Work Reviewer | Related work section | `related_work.md`, `citations_and_references.md` |
| 4 | Methods Reviewer | Methods sections | `methods.md`, `task_formulation.md`, `math_and_formulas.md` |
| 5 | Results Reviewer | Results/experiments sections | `results_and_analysis.md` |
| 6 | Conclusion & Supplements Reviewer | Conclusion + limitations | `conclusion.md`, `limitations.md`, `ethical_considerations.md` |
| 7 | Appendix Reviewer | Appendix sections (auto-assigned via `\appendix` detection) | `faq_appendix.md` |
| 8 | Writing Style Reviewer | Full document | `grammar_and_punctuation.md`, `capitalization_and_acronyms.md`, `general_writing_habits.md`, `citations_and_references.md` |
| 9 | LaTeX & Formatting Reviewer | Full document | `latex_formatting.md`, `math_and_formulas.md`, `table_formatting.md` |
| 10 | Figures & Captions Reviewer | Extracted figure/table environments + context | `caption_writing.md`, `figure1_design.md`, `experiment_visualization.md` |

#### Dynamic Agents (0-2+)

| Agent | Condition | Input | Skills |
|-------|-----------|-------|--------|
| Paper Type Reviewer | Always added if a guideline file exists for the classified type. Reviews against the full paper type skill file. (Separate from the `typeSpecificGuidance` that is injected into all static agents.) | Full document | `03_paper_types/{type}_paper.md` |
| Venue Reviewer | Added when user selects a venue other than arXiv. Standalone — venue info is not injected into static agents. | Full document | `02_venues/{venue}.md` |
| Hybrid Reviewer(s) | Created for each unique multi-category combination from Phase 2 | Relevant sections | Merged skill files from all component agents |

Each subagent receives:
- **System prompt**: Skill file content + type-specific guidance from Phase 2 + role model paper injection (if provided)
- **User prompt**: The full relevant text (no pre-truncation)
- **Output**: Structured JSON via `generateObject()` + Zod schema

Each comment has: `{ highlightText, comment, severity }` where `highlightText` is an exact verbatim quote (20-200 chars) from the paper.

#### Hybrid Agents

When a section is assigned to 2 categories (e.g., methods + results), the orchestrator creates a hybrid agent:
1. Groups multi-category sections by their sorted category combination (e.g., `"methods+results"`)
2. Merges skill files from all component agents (deduplicated, preserving order)
3. Combines system preambles from each component agent
4. Collects all `guidanceKeys` so type-specific guidance from multiple categories is injected
5. Adds the hybrid section titles to `sectionMapping` under the combo key

#### Role Model Paper Injection

When the user uploads role model PDFs, `buildRoleModelInjection()` appends a section to each subagent's system prompt containing:
- Instructions to study STRUCTURE/ORGANIZATION/WRITING STYLE only, not content
- Agent-specific comparison hints from `ROLE_MODEL_AGENT_HINTS` (10 entries, one per agent type)
- Full extracted text of each role model paper

Example hint for the abstract agent: *"Compare abstract structure: Does the user follow a similar sentence pattern (context → problem → method → results → impact)?"*

**Design choice**: `generateObject()` with Zod schemas is used instead of raw JSON parsing. This ensures the LLM output always conforms to the expected structure — no fragile regex/JSON extraction from free-text responses.

**Design choice**: Section-specific agents receive only their section's text (not the whole paper) to focus the LLM's attention. Full-document agents (writing style, LaTeX) receive the entire `merged.tex`. If any call exceeds the context window, `generateObjectWithRetry()` handles it automatically.

**Design choice**: `Promise.allSettled()` (not `Promise.all()`) ensures that if one agent fails or times out, the others still complete successfully.

### Phase 4 — Comment Deduplication

After all agents return, overlapping comments from different agents are deduplicated:

1. **Find positions**: Locate each comment's `highlightText` in `mergedTex`
2. **Detect overlaps**: For each pair of comments, check if their highlighted regions overlap ≥ 50% of the shorter highlight
3. **Compare similarity**: Use Dice coefficient (bigram similarity) on the comment text
   - Similarity ≥ 0.4: same concern raised by two agents → remove one
   - Similarity < 0.4: genuinely different feedback → keep both
4. **Tiebreaking** (which to remove):
   - Keep higher severity (`critical` > `warning` > `suggestion`)
   - Same severity: prefer section-specific agent over full-document agent
   - Same type: keep the longer (more detailed) comment

**Impact**: Testing across 18 cached projects showed deduplication removes ~24% of comments (479/1988), with 97% of overlapping pairs being true duplicates (similar feedback from different agents).

**Design choice**: Post-hoc deduplication (rather than preventing overlap upstream) preserves each agent's independence and allows agents to run in parallel without coordination. The dedup step is fast (pure string matching, no LLM calls).

### Phase 5 — Strict Mode Comment Pruning (conditional, 1 LLM call)

When `AI_TUTOR_STRICT_MODE=true` and there are more than 30 comments after dedup, a pruning LLM call selects the least important ones to remove:

1. **Build numbered list**: All comments are formatted with index, severity, agent, highlight, and comment text
2. **Ask LLM**: "Select exactly N comments to remove (the least important ones)"
3. **Zod schema**: Enforces the LLM returns exactly the right number of indices
4. **Fallback**: If the LLM call fails, falls back to severity-based sorting (keep criticals first, then warnings, then suggestions)

**Tiebreaking guidance** for the LLM:
- Keep `[critical]` comments — serious flaws
- Keep `[warning]` comments about methodology, claims, experimental validity
- Prefer removing comments about minor stylistic preferences, cosmetic issues, or nitpicks
- If two comments address similar concerns, remove the less specific one

**Logging**: Every removed comment and every kept comment is printed with severity, agent, highlight preview, and comment preview.

When strict mode is off or comments are already ≤ 30, this phase is a no-op.

### Phase 6 — Comment Position Mapping (exact + fuzzy)

Maps each comment's `highlightText` back to the correct original source file:

1. **Build inline map** from `% ========== INLINED FROM: ... ==========` markers in merged.tex
2. **Find `highlightText`** in merged.tex (exact match, then fuzzy match via sliding-window similarity) to determine the merged position
3. **Use inline map** to find which original file that position belongs to
4. **Search for `highlightText`** in the original file (exact, then fuzzy) to get the true offset
5. **Fallback**: If the direct mapping fails, search all documents for the text (exact, then fuzzy)

Fuzzy matching uses a configurable similarity threshold (default 0.85, overridable via `AI_TUTOR_FUZZY_THRESHOLD` env var).

A duplicate severity tag is stripped before prefixing comments: if the LLM echoes `[critical]` in the comment text and the severity field is also `critical`, the redundant tag is removed.

**Design choice**: Text search (not character offsets from the LLM) is used because LLMs cannot reliably count characters. The `highlightText` approach is robust — the LLM quotes exact text, and we search for it.

**Design choice**: Fuzzy matching handles cases where the LLM slightly misquotes text (adds/removes whitespace, changes punctuation). The sliding-window approach finds the best approximate match above the threshold.

## Context Length Handling

All LLM calls go through `generateObjectWithRetry()`, which sends full content on the first attempt. If the OpenAI API returns a context-length-exceeded error (detected by matching `context_length_exceeded`, `maximum context length`, `exceeds the context window`, or `maximum number of tokens` in the error message), it retries with progressively truncated prompts:

1. **Attempt 1**: Full prompt (100%)
2. **Attempt 2**: Truncated to 50% (first half + last half with `[... truncated ...]` marker)
3. **Attempt 3**: Truncated to 25%

Non-context errors are thrown immediately without retry.

**Design choice**: Always send full content first, only truncate on actual context length errors. This ensures the LLM sees as much of the paper as possible. Different models have different context windows, so hardcoded limits would be fragile.

## Comment Application (Frontend)

The frontend applies comments across **all project documents** automatically using a queue-based batch system:

1. Builds a queue of `(docPath, docId, comments[])` entries from `reviewResult.commentsByDoc`
2. Opens the first document via `openDocWithId()`
3. For each comment in the current document:
   - Re-fetches the snapshot via `currentDocument.getSnapshot()` to account for position shifts from previous operations
   - Searches for `highlightText` via `indexOf()`
   - Validates the position is within document bounds
   - Creates a thread via `POST /project/{id}/thread/{threadId}/messages`
   - Applies the comment operation: `{ c: highlightText, p: position, t: threadId }` via `submitOp()`
4. Advances to the next document in the queue and repeats
5. Reports total applied/skipped counts when done

A "Delete All AI Tutor Comments" button removes all comments with the `[AI Tutor]` prefix by scanning all threads and deleting matching ones via the backend.

### CodeMirror Position Safety

Comment decorations in CodeMirror can encounter out-of-range positions during document switching (the ranges tracker may dispatch positions from a previous document before CodeMirror has fully switched to the new one). Defensive bounds checking is applied at multiple levels:

- `createChangeRange()` — skips decorations where `from > docLength`, clamps `to`
- `buildHighlightDecorations()` — skips highlights where position >= docLength
- `updateDeleteWidgetHighlight()` — filters out widgets beyond docLength
- `ReviewPanelEntry` — skips `EditorSelection.cursor()` if position > doc.length; wraps hover highlight/clear dispatches in try/catch

## Logging

All procedural progress is logged to the web container's stdout (viewable via `docker compose logs web`). Logs use the `[AI Tutor]` prefix throughout. Key log points:

### Per-phase timing
- Overall start/end banners with `=====` separators, including project ID, model, venue, merged.tex size, docContentMap files
- Phase separators with `-----`, each phase logs elapsed time
- Final summary: per-phase timing breakdown, total elapsed, comments by document

### Phase 1
- Each parsed section: level, title, char count, position range

### Phase 2
- Abstract/introduction found + content length
- Numbered section list being assigned
- Skill context size
- LLM call: attempt number, system/prompt sizes, elapsed time, response preview (first 200 chars)
- Per-section assignment result: `"section title" => category`
- Final section mapping per category
- Fallback assignments (sections the LLM missed, assigned via keyword heuristics)

### Phase 3
- Per agent: starting, text source + size, system prompt size, skill files loaded, role model count
- Per agent LLM call: attempt, sizes, elapsed time, response preview
- Per agent validation: X/Y comments kept, discarded comments with highlightText + comment preview
- Per agent: each validated comment (severity, highlightText preview, comment preview)
- Overall: all agents returned, per-agent status (OK/SKIPPED/FAILED), total raw comments

### Phase 4
- Dedup pairs: which comment was removed (highlightText preview, agent name, similarity score, overlap ratio), which was kept
- Summary: N duplicate(s) removed (X → Y comments)

### Phase 5
- Whether pruning is triggered (comment count vs limit of 30)
- Every removed comment: index, severity, agent, highlight preview, comment preview
- Every kept comment: severity, agent, highlight preview, comment preview
- Summary: X → Y comments
- Fallback trigger if LLM pruning fails

### Phase 6
- Inline map region details (file, char ranges)
- Per-comment: direct match, fuzzy match (with similarity score), fallback to other file, or unmapped
- Summary: direct/fallback/fuzzy/notFoundInMerged/unmapped counts

### JSONL Review Logs

Each completed review is appended to a daily JSONL file at `/var/lib/overleaf/ai-tutor-logs/ai-tutor-YYYY-MM-DD.jsonl` with:
- Timestamp, project ID, user ID, model, venue
- Role model paper names (if any)
- Paper type classification
- Summary (totals by category and severity)
- Failed agents list
- All comments with highlightText, comment, severity, category, agentName, docPath

### Cache Files

Per-project cache at `/var/lib/overleaf/ai-tutor-cache/{projectId}/`:
- `merged.tex` — inlined LaTeX with `INLINED FROM` markers
- `metadata.json` — project structure and file categorization
- `review_comments.json` — full review output
- `role_model_*.txt` — extracted text from uploaded role model PDFs (for debugging)

## File Reference

All paths are relative to `/home/ubuntu/overleaf/`.

### Backend — Agent Orchestration

- **[`services/web/app/src/Features/Chat/AiTutorReviewOrchestrator.mjs`](services/web/app/src/Features/Chat/AiTutorReviewOrchestrator.mjs)**
  The core multi-agent engine. Contains:
  - `parseSections(mergedTex)` — Phase 1: regex-based LaTeX section parsing with `\appendix` boundary detection
  - `generateObjectWithRetry(options, label)` — wrapper around `generateObject()` that retries with progressively truncated prompts on context-length-exceeded errors
  - `classifyPaper(openai, model, sections)` — Phase 2: LLM paper type classification, multi-label per-section assignment to reviewer categories, dynamic guidance generation. Returns `{ paperType, paperTypeSummary, sectionMapping, hybridSections, typeSpecificGuidance }`
  - `buildSectionMapping(sectionAssignments, sections)` — converts per-section LLM assignments into category→titles map. Forces `isAppendix` sections to appendix category. Returns `{ mapping, hybridSections }` where hybridSections contains multi-category sections
  - `runSubagent(...)` — runs a single reviewer subagent with skill files, section text, type-specific guidance (supports multiple `guidanceKeys` for hybrid agents), and role model injection
  - `deduplicateComments(comments, mergedTex)` — Phase 4: removes overlapping comments from different agents using position overlap detection + Dice coefficient similarity
  - `pruneCommentsWithLLM(openai, model, comments)` — Phase 5: when strict mode is on and comments exceed 30, asks LLM to select least important ones to remove. Falls back to severity-based sorting on failure
  - `buildRoleModelInjection(roleModelTexts, agentId)` — builds role model prompt section with agent-specific comparison hints
  - `ROLE_MODEL_AGENT_HINTS` — lookup table with comparison focus hints for all 10 agent types
  - `SUBAGENT_DEFS` — the 10 static subagent definitions (id, name, skills, section categories, system preamble, `textOnly` flag)
  - `extractFigureTableEnvironments(mergedTex)` — extracts `\begin{figure}` / `\begin{table}` environments with surrounding context
  - `fuzzyFindInText(needle, haystack)` — sliding-window fuzzy string matching with configurable threshold
  - `mapCommentsToDocuments(...)` — Phase 6: maps `highlightText` strings back to original source files using exact + fuzzy matching
  - `runFullReview({...})` — main entry point that orchestrates all phases (1→2→3→4→5→6), dynamically adds paper type + venue + hybrid agents

### Backend — Route Handlers

- **[`services/web/app/src/Features/Chat/ChatController.mjs`](services/web/app/src/Features/Chat/ChatController.mjs)**
  Express route handlers for all AI Tutor endpoints:
  - `reviewWholeProject` — the main endpoint. Gathers all project docs/files, finds root doc, inline-expands `\input`/`\include`, categorizes files, validates and saves role model texts to cache, writes `merged.tex` + `metadata.json`, then calls `runFullReview()`. Logs results to JSONL. Returns review results with `metadata` and `docPathToId` mapping.
  - `deleteAiTutorComments` — scans all threads in a project, deletes those with `[AI Tutor]` prefix, returns count of deleted threads.
  - `analyzeWholeProject` — standalone project analysis endpoint (kept for backward compatibility)
  - `logAITutorSuggestions` — logs AI tutor activity to daily JSONL files
  - `sendThreadMessage` — posts a thread message and emits `new-comment` socket event for real-time UI updates

### Backend — Route Definitions

- **[`services/web/app/src/router.mjs`](services/web/app/src/router.mjs)** (lines ~1076–1110)
  Defines the AI Tutor HTTP endpoints:
  - `POST /project/:project_id/ai-tutor-log` → `ChatController.logAITutorSuggestions`
  - `POST /project/:project_id/ai-tutor-analyze` → `ChatController.analyzeWholeProject`
  - `POST /project/:project_id/ai-tutor-review` → `ChatController.reviewWholeProject`
  - `DELETE /project/:project_id/ai-tutor-delete-comments` → `ChatController.deleteAiTutorComments`
  All routes are protected by `blockRestrictedUserFromProject` + `ensureUserCanReadProject` middleware.

### Backend — Skill Library

- **[`services/web/app/src/Features/Chat/ai-tutor-skills/`](services/web/app/src/Features/Chat/ai-tutor-skills/)**
  41 markdown skill files organized in 7 directories. Loaded at review time by the orchestrator and injected into subagent system prompts.
  - [`CONTENTS.md`](services/web/app/src/Features/Chat/ai-tutor-skills/CONTENTS.md) — master index with modality tags (`[TEXT]` vs `[MULTIMODAL]`)
  - [`01_setup/`](services/web/app/src/Features/Chat/ai-tutor-skills/01_setup/) — prototype paper search strategies + review sets guide (3 files)
  - [`02_venues/`](services/web/app/src/Features/Chat/ai-tutor-skills/02_venues/) — 8 venue-specific guidelines (ICML 2026, ICLR 2026, NeurIPS 2025, AAAI 2026, ACL 2026, EMNLP 2025, COLM 2026, arXiv default). Each includes page limits, required sections, formatting rules, and reviewer criteria.
  - [`03_paper_types/`](services/web/app/src/Features/Chat/ai-tutor-skills/03_paper_types/) — 7 paper type definitions (analysis, dataset, method_improvement, llm_engineering, llm_inference_findings, css, position). All loaded into Phase 1 classifier.
  - [`04_paper_sections/`](services/web/app/src/Features/Chat/ai-tutor-skills/04_paper_sections/) — 10 section-specific writing guides (abstract, introduction, task_formulation, related_work, methods, results_and_analysis, conclusion, limitations, ethical_considerations, faq_appendix). Loaded per-subagent based on which sections they review.
  - [`05_figures_and_tables/`](services/web/app/src/Features/Chat/ai-tutor-skills/05_figures_and_tables/) — 6 visual element guides (figure1_design, experiment_visualization, color_palettes, data_visualization, table_formatting, caption_writing). Loaded by Figures & Captions reviewer.
  - [`06_writing_style/`](services/web/app/src/Features/Chat/ai-tutor-skills/06_writing_style/) — 6 formatting and language guides (grammar_and_punctuation, citations_and_references, latex_formatting, math_and_formulas, capitalization_and_acronyms, general_writing_habits). Loaded by Writing Style and LaTeX Formatting reviewers.

### Backend — Review Sets

- **[`services/web/app/src/Features/Chat/ai-tutor-skills/review_sets/`](services/web/app/src/Features/Chat/ai-tutor-skills/review_sets/)**
  Curated JSON files containing accepted papers from recent top conferences, with full reviewer feedback (scores, strengths, weaknesses). Referenced by venue skill files to help agents find topically relevant exemplar papers.
  - `ICLR2025_50_high_quality_papers.json` — 50 papers with avg reviewer score ≥ 8
  - `ICLR2025_50_low_quality_papers.json` — 50 lower-scored papers (negative reference)
  - `NeurIPS2025_100_high_quality_papers.json` — 100 high-quality accepts
  - `NeurIPS2025_100_low_quality_papers.json` — 100 lower-scored papers
  - `COLM2025_50_high_quality_papers.json` — 50 high-quality COLM accepts

### Frontend — Service Layer

- **[`services/web/frontend/js/features/editor-left-menu/utils/ai-tutor-service.ts`](services/web/frontend/js/features/editor-left-menu/utils/ai-tutor-service.ts)**
  TypeScript API functions and type definitions:
  - `runFullReview(projectId, model, venue, roleModelTexts)` — calls `POST /ai-tutor-review`, returns `ReviewResult` with `commentsByDoc`, `summary`, `classification`, `failedAgents`, `metadata`, `docPathToId`, `roleModelPapers`
  - `deleteAiTutorComments(projectId)` — calls `DELETE /ai-tutor-delete-comments`, returns `{ deleted: number }`
  - Type interfaces: `WholeProjectMetadata`, `FileCategory`, `ReviewComment`, `ReviewResult`

### Frontend — UI Panel

- **[`services/web/frontend/js/features/ide-redesign/components/ai-tutor/ai-tutor-panel.tsx`](services/web/frontend/js/features/ide-redesign/components/ai-tutor/ai-tutor-panel.tsx)**
  The React component for the AI Tutor sidebar panel. Contains:
  - **Model dropdown** — GPT-4o, GPT-4o Mini, GPT-4.1, GPT-4.1 Mini, GPT-5.2, GPT-5.2 Chat (default: GPT-5.2 Chat)
  - **Venue dropdown** — arXiv (default), COLM 2026, ICML 2026, ACL 2026, AAAI 2026, ICLR 2026, EMNLP 2025, NeurIPS 2025
  - **Role model PDF upload** — up to 3 PDFs with client-side text extraction, file list with char counts and remove buttons
  - **"Run Full Review" button** (`handleFullReview`) — triggers the combined project analysis + multi-agent review. Shows progress message during the request, then displays review summary
  - **"Apply Comments" button** (`handleApplyComments`) — batch-applies review comments across all documents by switching between files automatically via a queue
  - **"Delete All AI Tutor Comments" button** (`handleDeleteComments`) — removes all AI Tutor comments from the project
  - **Review summary** (collapsible) — paper type, role model papers used, comments by category/severity/document, failed agents
  - **File details** (collapsible) — TeX files, figures, bib files, merged char count

### Frontend — PDF Text Extraction

- **[`services/web/frontend/js/features/ide-redesign/components/ai-tutor/extract-pdf-text.ts`](services/web/frontend/js/features/ide-redesign/components/ai-tutor/extract-pdf-text.ts)**
  Client-side PDF text extraction using pdfjs-dist (already installed in Overleaf). Configures its own worker via `workerSrc` to avoid conflicting with Overleaf's PDF viewer (which uses `workerPort`). Truncates at 60K chars per paper. Exports `extractTextFromPdf(file: File)` and `RoleModelPaper` interface.

### Frontend — CodeMirror Position Safety

- **[`services/web/frontend/js/features/source-editor/extensions/ranges.ts`](services/web/frontend/js/features/source-editor/extensions/ranges.ts)**
  CodeMirror extension that creates decorations from comment/change positions. Modified to accept `docLength` parameter and bounds-check all positions before creating decorations.

- **[`services/web/frontend/js/features/review-panel/components/review-panel-entry.tsx`](services/web/frontend/js/features/review-panel/components/review-panel-entry.tsx)**
  Review panel entry component. Modified to skip out-of-range cursor positions and wrap hover highlight dispatches in try/catch.

### Frontend — Styles

- **[`services/web/frontend/stylesheets/pages/editor/ai-tutor.scss`](services/web/frontend/stylesheets/pages/editor/ai-tutor.scss)**
  Theme-aware styles for the AI Tutor panel. Overrides form label/control colors to use `--content-primary-themed`, `--bg-secondary-themed`, `--border-divider-themed` CSS variables so text is visible in both light and dark editor themes.

### Configuration & Infrastructure

- **[`.env`](.env)** (gitignored)
  Stores `OPENAI_API_KEY=sk-...`. Read by docker-compose and passed into the web container.

- **[`develop/docker-compose.yml`](develop/docker-compose.yml)**
  Docker Compose configuration. AI Tutor additions:
  - `env_file: ../.env` on the web service to forward `OPENAI_API_KEY`
  - Volume mounts: `./ai-tutor-cache:/var/lib/overleaf/ai-tutor-cache` and `./ai-tutor-logs:/var/lib/overleaf/ai-tutor-logs`

### Runtime Cache (generated, not committed)

- **`develop/ai-tutor-cache/{projectId}/`** — per-project cache directory
  - `merged.tex` — all .tex files inlined via recursive `\input`/`\include` replacement, with `% ========== INLINED FROM: ... ==========` markers
  - `metadata.json` — project name, root doc path, file categorization (tex, figures, bib, useful, irrelevant), merged tex length
  - `review_comments.json` — cached output of the full review: classification, commentsByDoc, summary, failedAgents
  - `role_model_*.txt` — extracted text from uploaded role model PDFs

- **`develop/ai-tutor-logs/`** — daily JSONL log files (`ai-tutor-YYYY-MM-DD.jsonl`) recording each review with timestamps, project/user IDs, model, venue, role model papers, classification, all comments

## API Endpoints

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| POST | `/project/:id/ai-tutor-review` | `reviewWholeProject` | Analyzes project + runs full multi-agent review |
| POST | `/project/:id/ai-tutor-analyze` | `analyzeWholeProject` | Standalone project analysis (backward compat) |
| POST | `/project/:id/ai-tutor-log` | `logAITutorSuggestions` | Log AI suggestions to disk |
| DELETE | `/project/:id/ai-tutor-delete-comments` | `deleteAiTutorComments` | Delete all AI Tutor comments from project |

## Configuration

### API Key

Store your OpenAI API key in `/.env` (gitignored):
```
OPENAI_API_KEY=sk-...
```

Passed to the web container via `env_file: ../.env` in `docker-compose.yml`.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | (required) | OpenAI API key |
| `AI_TUTOR_FUZZY_THRESHOLD` | `0.85` | Fuzzy matching similarity threshold (0.0–1.0) for Phase 6 |
| `AI_TUTOR_LOG_PROMPTS` | `false` | Set to `true` to log full LLM prompts and responses |
| `AI_TUTOR_STRICT_MODE` | `false` | Set to `true` to only generate critical/warning comments and prune to ≤30 via Phase 5 |
| `AI_TUTOR_SHOW_PREFIX` | `true` | Set to `false` to hide the `[AI Tutor]` prefix from comment text |

### Model Selection

Users select the model from a dropdown in the AI Tutor panel. Options:
- GPT-4o
- GPT-4o Mini
- GPT-4.1
- GPT-4.1 Mini
- GPT-5.2
- GPT-5.2 Chat (default)

### Venue Selection

Users can optionally select a target venue:
- arXiv / No Specific Venue (default — no venue agent)
- COLM 2026, ICML 2026, ACL 2026, AAAI 2026, ICLR 2026, EMNLP 2025, NeurIPS 2025

When a venue is selected, a dynamic Venue Reviewer agent is added that checks against that conference's page limits, required sections, and reviewer criteria.

## Robustness

| Failure Mode | Mitigation |
|---|---|
| LLM returns malformed output | `generateObject()` with Zod schema enforces structure |
| Subagent timeout | `Promise.race()` with 2-minute timeout per agent |
| One agent fails | `Promise.allSettled()` — other agents continue |
| `highlightText` not found in doc (exact) | Fuzzy matching with configurable threshold |
| `highlightText` not in expected file | Fallback search across all documents |
| API rate limit | Failed agents reported in `failedAgents` array |
| Input exceeds context window | `generateObjectWithRetry()` retries with 50%, then 25% of prompt |
| No matching sections for an agent | Agent skipped gracefully with reason |
| Section not assigned by LLM | `buildSectionMapping()` fallback assigns via keyword heuristics |
| Section title fuzzy mismatch | `collectSectionContent()` falls back to partial string matching |
| Skill file not found | Logs warning, continues with placeholder text |
| Comment position out of range | CodeMirror bounds checking skips invalid decorations |
| Duplicate comments across agents | Phase 4 deduplication via position overlap + text similarity |
| Too many comments (>30) in strict mode | Phase 5 LLM-based pruning with severity-based fallback |
| Duplicate severity tags | Regex strip before prefixing `[AI Tutor] [severity]` |
| Document switching race condition | Position bounds checking at decoration, highlight, and selection levels |
| PDF extraction fails (scanned/image PDF) | Error shown in UI, review proceeds without role models |

## Multimodal Interface (Future)

Each subagent definition has a `textOnly: boolean` field. Currently all agents are text-only. The `05_figures_and_tables/` skills have `[MULTIMODAL]` tags. When multimodal support is added:
1. Set `textOnly: false` on the Figures & Captions Reviewer
2. Pass compiled PDF page images alongside the LaTeX source
3. The agent can then review actual figure appearance, color palettes, chart types, etc.

## Dependencies

- **Vercel AI SDK** (`ai` v6.0.2) — `generateObject()` for structured LLM output
- **@ai-sdk/openai** (v3.0.0) — OpenAI provider with `createOpenAI({ apiKey })`
- **zod** — Schema validation for LLM output structure
- **pdfjs-dist** (v5.1.91) — Client-side PDF text extraction for role model papers (already installed in Overleaf)
