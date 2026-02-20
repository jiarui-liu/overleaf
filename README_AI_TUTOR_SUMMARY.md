# AI Writing Tutor for Overleaf — Summary

## How to Use

1. Go to the Overleaf instance and log in with your username and password (or register a new account).
2. Upload or create a LaTeX project from the project dashboard.
3. Open the project, then click the **AI Tutor** icon in the right-side panel to open the tutor.
4. Select an LLM model from the dropdown (default: GPT-5.2).
5. Optionally select a target venue (e.g., ICML, ICLR, NeurIPS) for venue-specific feedback.
6. Optionally upload up to 3 role model PDFs — exemplary papers whose structure and writing style the agents will reference (content/topics are ignored).
7. Click **Run Full Review** and wait for all reviewer agents to complete (~30–60 seconds).
8. Once the review finishes, click **Apply Comments** to insert all feedback as native Overleaf comment threads anchored to specific text spans in your documents.
9. Switch to the **Comments** panel (speech-bubble icon in the right rail) to browse, resolve, or reply to each comment.
10. Use **Delete All AI Tutor Comments** to clear all generated comments if needed.

---

The AI Writing Tutor is a multi-agent review system integrated into Overleaf that provides inline feedback on academic LaTeX papers. When a user clicks "Run Full Review," the system merges the project's LaTeX files, classifies the paper type (e.g., dataset, methods, LLM engineering), and launches 11+ reviewer agents in parallel — each specializing in a different aspect such as abstract structure, methods clarity, results presentation, writing style, or LaTeX formatting.

## Frontend

The tutor lives in a right-rail panel within the Overleaf editor. Users select an LLM model, a target venue (ICML, ICLR, NeurIPS, AAAI, ACL, EMNLP, COLM, or arXiv/default), and optionally upload up to 3 role model PDFs for structure/style comparison. PDF text is extracted client-side using pdfjs-dist. After the review completes, users click "Apply Comments" to insert all feedback as native Overleaf review threads anchored to specific text spans. A "Delete All" button removes all AI Tutor comments.

## Backend

The backend controller fetches all project documents, recursively expands `\input{}` commands into a single merged TeX file, and passes it to the review orchestrator. The orchestrator runs four phases: section parsing, paper type classification with section-to-agent mapping, parallel subagent execution (each receiving relevant sections plus skill file guidelines), and comment-to-document position mapping using exact and fuzzy string matching. Each agent produces up to 10 structured comments with severity labels (suggestion, warning, critical). When a venue is selected, an additional venue-specific agent reviews against that conference's page limits, required sections, and reviewer criteria. Role model paper text is injected into all agents with instructions to compare structure and style only, not content.

## Skill Library

A library of 30+ markdown files organized into six categories (setup, venues, paper types, paper sections, figures/tables, writing style) provides the domain knowledge that grounds each agent's review.
