# AI Writing Tutor for Overleaf

An multi-agent AI review system integrated into Overleaf that provides inline feedback on academic papers. The system analyzes LaTeX projects, classifies paper type, and runs 11+ parallel reviewer agents that each focus on a specific aspect of writing quality.


## Contributions

- Multi-agent review architecture with 11 static + 2 dynamic reviewer subagents running in parallel
- Paper type classification (7 types) with type-specific reviewing guidelines
- Section-level assignment so each agent reviews only its relevant sections
- Venue-specific review against 7 major ML/NLP conference requirements (ICML, ICLR, NeurIPS, AAAI, ACL, EMNLP, COLM)
- Role model paper upload with client-side PDF text extraction for structure/style comparison
- Inline comment application as native Overleaf review threads with highlight anchoring
- Skill library with 30+ markdown guideline files organized across 6 categories
- Fuzzy matching for comment positioning (Dice coefficient similarity) with multi-pass fallback
- Full review logging (JSONL) and caching for debugging and analysis


## Frontend

All frontend code is in `services/web/frontend/js/features/`.

### AI Tutor Panel (`ide-redesign/components/ai-tutor/ai-tutor-panel.tsx`)

The main UI component rendered in the editor's right rail. Contains:

- **Model selector** — dropdown to choose the LLM (GPT-4o, GPT-4.1, GPT-5.2 variants). Defaults to gpt-5.2-chat-latest.
- **Venue selector** — dropdown with 8 options (arXiv/default + 7 conferences). Controls whether a venue-specific reviewer agent is added.
- **Role model paper upload** — file input accepting up to 3 PDFs. Extracts text client-side using pdfjs-dist. Shows file names, extracted char counts, and remove buttons. Agents compare the user's paper structure/style against these exemplars.
- **Run Full Review button** — triggers the full pipeline. Shows progress text during the 30-60s review.
- **Apply Comments button** — appears after review completes. Iterates through all documents, opens each one, and applies comments as native Overleaf review threads using `submitOp` with comment operations.
- **Delete All AI Tutor Comments button** — removes all `[AI Tutor]` prefixed comment threads from the project.
- **Review summary** — expandable section showing paper type, role model papers used, comment counts by category/severity/document, and any failed agents.
- **File details** — expandable section showing TeX files merged, figures found, and bib files detected.

### PDF Text Extraction (`ide-redesign/components/ai-tutor/extract-pdf-text.ts`)

Client-side PDF text extraction using pdfjs-dist (already bundled in Overleaf). Configures its own worker via `workerSrc` to avoid conflicting with the PDF viewer's global worker. Truncates at 60K chars per paper.

### API Service (`editor-left-menu/utils/ai-tutor-service.ts`)

Typed API layer exporting:
- `runFullReview(projectId, model, venue, roleModelTexts)` — POST to `/project/:id/ai-tutor-review`
- `deleteAiTutorComments(projectId)` — POST to `/project/:id/ai-tutor-delete-comments`
- TypeScript interfaces for `ReviewComment`, `ReviewResult`, `WholeProjectMetadata`


## Backend

All backend code is in `services/web/app/src/Features/Chat/`.

### ChatController.mjs — Route Handlers

**`reviewWholeProject(req, res)`** — the main entry point. Performs:

1. Project analysis
   - Fetches all docs and files from Overleaf's document store
   - Finds root document (via `rootDoc_id` or `\documentclass` detection)
   - Builds `docContentMap` mapping normalized paths to file contents
   - Recursively inline-expands `\input{}` and `\include{}` commands to produce `merged.tex`
   - Categorizes files into 5 types: TeX, figures, bib, useful (sty/cls), irrelevant
   - Writes `merged.tex` and `metadata.json` to cache directory

2. Parameter handling
   - Extracts `model`, `venue`, `roleModelTexts` from request body
   - Validates role model texts (max 3 papers, 80K chars each)
   - Saves role model text to cache as `role_model_*.txt` for debugging

3. Review orchestration
   - Calls `runFullReview()` from the orchestrator
   - Attaches metadata and `docPathToId` mapping to the response

4. Logging
   - Writes JSONL log entries to `/var/lib/overleaf/ai-tutor-logs/ai-tutor-{date}.jsonl`
   - Each entry includes: timestamp, userId, projectId, model, venue, roleModelPapers, paperType, summary, all comments

**`deleteAiTutorComments(req, res)`** — finds all comment threads whose first message starts with `[AI Tutor]` and deletes them via the chat API.

### AiTutorReviewOrchestrator.mjs — Review Pipeline

The core review engine with 4 phases:

**Phase 0 — Section Parsing**
- Regex-based extraction of `\section`, `\subsection`, `\subsubsection`, and `\begin{abstract}` from merged.tex
- Returns array of `{title, level, content, charStart, charEnd}`

**Phase 1 — Paper Type Classification + Section Mapping**
- Sends abstract + introduction + section outline to LLM
- Classifies into one of 7 paper types: dataset, method_improvement, llm_engineering, llm_inference_findings, css, position, other
- Maps each section to a review category: abstract, introduction, related_work, methods, results, conclusion, appendix
- Generates type-specific reviewing guidance for each category

**Phase 2 — Parallel Reviewer Subagents**
- 11 static agents defined in `SUBAGENT_DEFS`:
  - Abstract Reviewer, Introduction Reviewer, Related Work Reviewer, Methods Reviewer, Results Reviewer, Conclusion & Supplements Reviewer, Appendix Reviewer, Writing Style Reviewer, LaTeX & Formatting Reviewer, Figures & Captions Reviewer, Structure & Narrative Reviewer
- Up to 2 dynamic agents added at runtime:
  - Paper Type Reviewer — loaded if a matching `03_paper_types/{type}_paper.md` skill file exists
  - Venue Reviewer — loaded if venue is not `arxiv` and a matching `02_venues/{venue}.md` file exists
- Each agent receives:
  - A system prompt with its skill file content, type-specific guidance, and role model paper injection (if provided)
  - Review text: either specific sections (for section-focused agents), full document (for style/formatting/venue agents), figure/table environments (for figures agent), or a structural skeleton (for structure agent)
- All agents run in parallel with 120s timeout per agent
- Each returns up to 10 structured comments with `{highlightText, comment, severity}`

**Phase 3 — Comment Position Mapping**
- Maps comments from merged.tex positions back to original source documents
- Parses inline markers (`% ========== INLINED FROM: {path} ==========`) to build a position-to-file map
- Three-pass matching strategy:
  1. Exact string match in the expected source file
  2. Fuzzy match (Dice coefficient >= 0.85) in the expected file
  3. Fuzzy fallback across all project documents
- Prefixes all comments with `[AI Tutor] [severity] [agent name]`

### Key Helper Functions

- `loadSkill(relativePath)` — reads markdown files from `ai-tutor-skills/`
- `parseSections(tex)` — regex section parser
- `classifyPaper(openai, model, sections)` — LLM-based paper type classification
- `collectSectionContent(sections, titleList)` — gathers text for section-specific agents with deduplication of parent/child sections
- `extractFigureTableEnvironments(tex)` — regex extraction of figure/table LaTeX environments with surrounding context
- `buildSkeleton(sections)` — creates a structural overview with section titles and first sentences
- `buildRoleModelInjection(roleModelTexts, agentId)` — builds agent-specific role model comparison prompts with instructions to focus on structure/style, not content
- `generateObjectWithRetry(params)` — LLM call wrapper with automatic context truncation and retry on token limit errors
- `mapCommentsToDocuments(comments, mergedTex, docContentMap, rootDocPath)` — the three-pass comment positioning engine


## Skill Library

Located in `ai-tutor-skills/`. Organized into 6 folders:

```
01_setup/              — paper type definitions for classification
02_venues/             — venue-specific requirements (7 conferences + arxiv default)
03_paper_types/        — per-type reviewing guidelines (dataset, methods, LLM, etc.)
04_paper_sections/     — section-level writing guidance (abstract, intro, methods, etc.)
05_figures_and_tables/ — figure/table/caption best practices
06_writing_style/      — grammar, style, LaTeX formatting conventions
```

Each file is a markdown document loaded as context for the relevant agent's system prompt.


## Data Flow

```
Browser                         Server
-------                         ------
Select model, venue         →
Upload role model PDFs      →   (text extracted client-side)
Click "Run Full Review"     →   POST /project/:id/ai-tutor-review
                                  { model, venue, roleModelTexts }
                                ↓
                                Fetch all docs from docstore
                                Inline-expand \input{} → merged.tex
                                Categorize files → metadata.json
                                Validate role model texts → cache
                                ↓
                                Phase 0: Parse sections
                                Phase 1: Classify paper type + map sections
                                Phase 2: Run 11-13 agents in parallel
                                Phase 3: Map comments to source files
                                ↓
                            ←   JSON response with comments, classification,
                                summary, docPathToId mapping

Click "Apply Comments"
  For each document:
    Open document in editor
    For each comment:
      POST /thread/:id/messages
      submitOp({c, p, t})   →   Comment appears as review thread
```


## File Locations

| Component | Path |
|-----------|------|
| Frontend panel | `services/web/frontend/js/features/ide-redesign/components/ai-tutor/ai-tutor-panel.tsx` |
| PDF extraction | `services/web/frontend/js/features/ide-redesign/components/ai-tutor/extract-pdf-text.ts` |
| API service | `services/web/frontend/js/features/editor-left-menu/utils/ai-tutor-service.ts` |
| Backend controller | `services/web/app/src/Features/Chat/ChatController.mjs` |
| Review orchestrator | `services/web/app/src/Features/Chat/AiTutorReviewOrchestrator.mjs` |
| Skill library | `services/web/app/src/Features/Chat/ai-tutor-skills/` |
| Review logs | `/var/lib/overleaf/ai-tutor-logs/ai-tutor-{date}.jsonl` |
| Review cache | `/var/lib/overleaf/ai-tutor-cache/{projectId}/` |
