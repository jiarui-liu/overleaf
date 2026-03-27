# AI Tutor: A Multi-Agent Writing Assistant for Machine Learning Research Papers

## 1. Introduction

Writing a high-quality machine learning research paper is one of the most challenging tasks facing researchers at every career stage. The difference between an accepted and a rejected paper often comes down not to the strength of the underlying ideas, but to how clearly and effectively those ideas are communicated. Reviewers at top-tier venues such as ACL, NeurIPS, ICLR, and EMNLP consistently cite clarity, presentation, and paper structure as major factors in their acceptance decisions. A paper with strong experimental results but a disorganized introduction, a misplaced related work section, or unclear methodology descriptions will struggle to earn positive reviews.

Senior researchers develop an intuitive sense for what makes a paper well-written. They can glance at a draft and immediately identify that the introduction is too long, that the motivation is buried in the wrong paragraph, that a figure caption fails to convey the key takeaway, or that the related work section does not adequately position the contribution. This kind of feedback is extraordinarily valuable, but it is also scarce. Senior researchers have limited bandwidth, and junior researchers — who need this guidance the most — often lack access to experienced mentors who can provide detailed, actionable writing feedback on their drafts before submission.

The AI Tutor project addresses this gap. It is a system that generates concrete, actionable writing suggestions for machine learning research papers, with a particular focus on clarity, structure, and overall paper quality. Rather than producing vague advice like "improve the writing" or assigning a numerical score, the system provides specific, text-anchored comments that point to exact passages in the paper and explain what should be changed and why. The system is integrated directly into Overleaf, the de facto standard for collaborative LaTeX paper writing in the machine learning community, so that authors can receive and act on feedback without ever leaving their writing environment.

The target venue for this work is the ACL 2026 System Demonstration track, which showcases working tools that serve the natural language processing and broader research community.

## 2. Motivation

### 2.1 The Writing Quality Problem

The machine learning research community produces tens of thousands of papers each year. At major conferences, acceptance rates hover between 20% and 30%, meaning that the vast majority of submitted papers are rejected. While many rejections stem from insufficient novelty or weak experimental evaluation, a substantial fraction are driven by poor presentation. Reviewers are volunteers reading dozens of papers under tight deadlines. A paper that is hard to follow, poorly organized, or riddled with formatting issues will not receive the careful reading it deserves, regardless of the quality of its technical contributions.

Common writing problems in machine learning papers include overly long introductions that fail to state the contribution clearly, related work sections that are either missing or placed in positions that interrupt the narrative flow, methodology sections that assume too much background knowledge or skip critical details, results sections that present tables and figures without adequate interpretation, and conclusions that simply restate the abstract without offering deeper reflection. These are not surface-level grammar issues — they are structural and rhetorical problems that require domain-specific knowledge to identify and fix.

### 2.2 The Limitations of Existing Tools

Several categories of tools exist that partially address this problem, but none provides a comprehensive solution.

**General-purpose large language models** such as ChatGPT or Claude can review papers when prompted to do so. However, using them for paper review involves a tedious copy-paste workflow: the author must extract text from their LaTeX project, paste it into a chat interface, read the feedback, mentally map it back to their source files, and manually apply changes. There is no integration with the writing environment, no persistent inline comments, and no structured approach to reviewing different aspects of the paper. The feedback is often generic and lacks the specificity that comes from understanding machine learning paper conventions.

**Grammar checking tools** such as Grammarly or LanguageTool provide surface-level corrections for spelling, grammar, and punctuation. While useful, these tools have no understanding of academic writing conventions, cannot identify structural problems, and are unable to provide domain-specific suggestions such as "this methods section should include an ablation study" or "the related work should cite the foundational work on attention mechanisms."

**AI reviewer systems** such as the Stanford AI Reviewer (paperreview.ai), Prismer, and CSPaper.org focus primarily on generating review scores or overall assessments. They treat the paper as a black box and produce output that mimics a conference review, but they do not provide inline, text-anchored feedback that authors can directly act on. The feedback is disconnected from the source text, making it difficult to translate into concrete revisions.

**Overleaf's built-in AI features** offer low-level editing assistance such as autocomplete and sentence rewriting. However, these features operate at the sentence level and lack the ability to provide high-level structural comments, identify misplaced sections, or suggest changes that span multiple paragraphs or the entire paper architecture.

### 2.3 Our Vision

The AI Tutor project fills the gap between these existing approaches. Our vision is to build a system that can provide the same kind of writing feedback that a senior researcher would give — specific, actionable, and grounded in deep knowledge of machine learning paper conventions — and deliver it directly within the Overleaf editor as inline comments. The system should understand that different types of papers (dataset papers, method improvement papers, analysis papers, position papers) have different conventions and expectations. It should be able to review individual sections with specialized expertise while also assessing the overall structure and flow of the paper. And it should present its feedback in a form that authors can immediately act on: highlighted text spans with attached comments, appearing in the same review panel that human collaborators use.

## 3. System Architecture

### 3.1 Integration with Overleaf

The AI Tutor is built as a direct modification of the Overleaf Community Edition, the open-source version of the popular collaborative LaTeX editor. Rather than implementing the system as a browser extension or external service, we chose to modify the Overleaf web service itself. This approach provides several advantages. First, it gives the system full access to the project's file structure, including all TeX files, figure files, bibliography files, and metadata. Second, it allows comments to be applied using Overleaf's native ShareJS operational transformation protocol, meaning that AI-generated comments are indistinguishable from human comments in the review panel. Third, it avoids the limitations and fragility of browser extensions, which can break with Overleaf updates and cannot access server-side project data.

The frontend addition is a new panel in the editor's sidebar rail, implemented as a React component in TypeScript. This panel contains a model selection dropdown, a "Run Full Review" button, a collapsible review summary display, a file-by-file comment list, and an "Apply Comments" button. The backend addition consists of new Express.js route handlers and a review orchestration engine, implemented as ES modules within the existing Overleaf web service.

### 3.2 High-Level Data Flow

When a user clicks the "Run Full Review" button, the following sequence occurs. The frontend sends a POST request to the `/ai-tutor-review` endpoint with the project ID and selected model. The backend gathers all documents and files from the project, identifies the root TeX file (the one containing `\documentclass`), and recursively resolves all `\input` and `\include` directives to produce a single merged TeX file. The backend also categorizes all project files into TeX files, figure files, bibliography files, useful auxiliary files, and irrelevant files. This merged TeX file and metadata are written to a per-project cache directory for debugging and potential reuse.

The merged TeX file is then passed to the review orchestration engine, which executes a four-phase pipeline. Phase 0 parses the TeX source into structured sections using regex. Phase 1 classifies the paper type and assigns each section to a reviewer category using a single LLM call. Phase 2 runs ten specialized reviewer agents in parallel, each focusing on a different aspect of the paper. Phase 3 maps the resulting comments back to their correct positions in the original source files. The complete results — paper classification, review summary, and comments organized by source file — are returned to the frontend, which displays them in the AI Tutor panel. The user can then click "Apply Comments" to inject the comments into Overleaf's native review system.

## 4. Methodology: The Four-Phase Pipeline

### 4.1 Phase 0: Section Parsing

The first phase extracts a structured list of sections from the merged LaTeX source. This is accomplished entirely with regular expressions, without any LLM involvement. The parser identifies the abstract (delimited by `\begin{abstract}` and `\end{abstract}`), and then finds all `\section{}`, `\subsection{}`, and `\subsubsection{}` headers. For each header, it captures the content from that header until the next header of the same or higher level. The output is an array of section objects, each containing the title, the hierarchical level (0 for abstract, 1 for section, 2 for subsection, 3 for subsubsection), the full text content, and the character start and end positions within the merged TeX file.

The design choice to use regex rather than an LLM for section parsing is deliberate. LaTeX sections are syntactically well-defined, making regex parsing deterministic, instantaneous, and free of cost. An LLM-based approach would introduce unnecessary latency, expense, and the risk of hallucination for a task that does not require language understanding.

### 4.2 Phase 1: Paper Type Classification and Section Assignment

The second phase makes a single LLM call to accomplish two critical tasks: classifying the paper type and assigning each parsed section to a reviewer category.

For paper type classification, the system recognizes seven categories: analysis papers, dataset papers, method improvement papers, LLM engineering papers, LLM inference and findings papers, computational social science papers, and position papers. Each paper type has different conventions and expectations. A dataset paper, for example, should describe the data collection process, annotation guidelines, inter-annotator agreement, and licensing, while a method improvement paper should include ablation studies, controlled comparisons with baselines, and clear descriptions of what is novel relative to prior work. The LLM receives the full abstract and introduction text, the section outline, and the definitions of all seven paper types (loaded from skill files), and produces a classification along with dynamically generated type-specific review guidance for each subagent.

For section assignment, the LLM maps each section from Phase 0 to one of six reviewer categories: abstract, introduction, related work, methods, results, or conclusion. This assignment is done per-section (each section receives exactly one category) rather than per-category (listing sections under each category) to ensure that no section is accidentally left unreviewed. The LLM-based approach is necessary because section titles vary enormously across papers. A section titled "RQ1: How Can Training Equip Models for Zero-Shot Generalization?" is a results section, but no keyword heuristic would reliably identify it as such. Only a language model that understands the content and context of the title can make correct assignments.

After the LLM responds, a function called `buildSectionMapping()` inverts the per-section assignments into the category-to-titles map that the subagents expect. A safety-net fallback mechanism assigns any sections that the LLM missed using keyword heuristics (for example, any section containing "experiment" in its title is assigned to the results category).

The type-specific guidance generated in this phase is particularly important. Rather than using fixed review templates, the Phase 1 LLM generates tailored criteria for each subagent based on the specific paper it has read. For a dataset paper about crowdsourcing, the guidance might emphasize checking for inter-annotator agreement reporting and annotation guideline descriptions. For a dataset paper about web scraping, the same guidance slot might instead emphasize licensing and ethical considerations. This dynamic approach produces more relevant and specific feedback than static templates could.

### 4.3 Phase 2: Parallel Multi-Agent Review

The third phase is the core of the system. Ten specialized reviewer agents run concurrently, each focusing on a different aspect of academic writing. The agents are:

1. **Abstract Reviewer**: Evaluates the abstract for completeness, clarity, and adherence to conventions for the identified paper type. Uses the abstract writing skill file.

2. **Introduction Reviewer**: Assesses whether the introduction clearly states the problem, motivation, contribution, and paper outline. Uses the introduction writing skill file.

3. **Related Work Reviewer**: Checks whether related work is comprehensive, properly positioned, and correctly cited. Uses the related work and citations skill files.

4. **Methods Reviewer**: Evaluates the methods section for clarity, completeness, reproducibility, and appropriate mathematical notation. Uses the methods, task formulation, and math formatting skill files.

5. **Results Reviewer**: Assesses whether results are clearly presented, properly interpreted, and supported by appropriate experiments. Uses the results and analysis skill file.

6. **Conclusion Reviewer**: Checks the conclusion, limitations, and ethical considerations sections. Uses the conclusion, limitations, ethical considerations, and FAQ/appendix skill files.

7. **Writing Style Reviewer**: Reviews the full document for grammar, punctuation, capitalization, acronym usage, and general writing habits. Uses the grammar, capitalization, and general writing habits skill files.

8. **LaTeX Formatting Reviewer**: Checks the full document for LaTeX best practices, including float placement, math environment usage, and table formatting. Uses the LaTeX formatting, math, and table formatting skill files.

9. **Figures and Captions Reviewer**: Evaluates extracted figure and table environments for caption quality, visualization effectiveness, and figure design. Uses the caption writing, figure design, and experiment visualization skill files.

10. **Structure Reviewer**: Assesses the overall paper organization using a skeleton of section titles and first sentences. Uses the general writing habits skill file.

Each agent receives a system prompt composed of its relevant skill file content and the type-specific guidance generated in Phase 1, along with a user prompt containing the relevant text. Section-specific agents (Abstract, Introduction, Related Work, Methods, Results, Conclusion) receive only their assigned sections' text, which focuses the LLM's attention and reduces the risk of the model commenting on parts of the paper outside its scope. Full-document agents (Writing Style, LaTeX Formatting) receive the entire merged TeX file. The Figures and Captions agent receives extracted figure and table environments with surrounding context. The Structure agent receives a paper skeleton consisting of section titles and their first sentences.

All agents produce structured output via the Vercel AI SDK's `generateObject()` function with Zod schema validation. Each comment in the output has three fields: `highlightText` (an exact verbatim quote of 20 to 200 characters from the paper), `comment` (the review suggestion), and `severity` (one of critical, suggestion, or nitpick). The use of structured output generation with schema validation eliminates the fragility of parsing free-text LLM responses and guarantees that every agent's output conforms to the expected format.

The ten agents run concurrently using `Promise.allSettled()`, which ensures that if any individual agent fails or times out (each has a two-minute timeout), the remaining agents still complete successfully. Failed agents are reported in a `failedAgents` array in the response, but they do not prevent the user from receiving feedback from the agents that succeeded. This graceful degradation is important for production reliability.

### 4.4 Phase 3: Comment Position Mapping

The final phase maps each comment's `highlightText` back to the correct original source file and position. This is necessary because the review was performed on the merged TeX file, but comments must be applied to the individual source files in the Overleaf project.

The mapping process works as follows. First, the system builds an inline map from the `% ========== INLINED FROM: filename.tex ==========` markers that were inserted during the file merging step. This map records which character ranges in the merged file correspond to which original files. Second, for each comment, the system searches for the `highlightText` string in the merged TeX file to determine its position. Third, the inline map is consulted to determine which original file owns that position. Fourth, the `highlightText` is searched for in the original file to obtain the true offset within that file. If the direct mapping fails (for example, due to text near an inline marker boundary), the system falls back to searching all documents in the project for the highlight text.

The design choice to use text search rather than character offsets from the LLM is critical. Large language models are notoriously unable to reliably count characters or tokens. Asking a model to report that its comment applies to characters 1,247 through 1,302 would produce unreliable results. Instead, by requiring the model to quote exact text from the paper, we can use simple string search to find the correct position. This approach is robust and position-independent.

## 5. The Skill Library

The skill library is a collection of 31 markdown files organized into five categories, totaling approximately 70,000 characters of expert knowledge about academic paper writing. These files serve as the knowledge base that informs the reviewer agents' feedback.

The first category, **Setup** (3 files), contains paper type definitions, an example papers guide indexing well-written papers by type, and strategies for finding prototype papers to emulate.

The second category, **Paper Types** (7 files), provides type-specific review criteria for each of the seven recognized paper categories. For example, the dataset paper skill file describes what reviewers expect in terms of data collection methodology, annotation processes, inter-annotator agreement, dataset statistics, licensing, and baseline experiments. The method improvement paper skill file describes expectations around ablation studies, controlled comparisons, novelty claims, and reproducibility.

The third category, **Paper Sections** (10 files), provides detailed writing guides for each section of a paper: abstract, introduction, task formulation, related work, methods, results and analysis, conclusion, limitations, ethical considerations, and FAQ/appendix. Each guide describes the purpose of the section, common mistakes, structural patterns that work well, and specific things reviewers look for.

The fourth category, **Figures and Tables** (6 files), covers visual elements: figure 1 design principles, experiment result visualization best practices, color palette recommendations for accessibility and print, general data visualization guidelines, table formatting conventions, and caption writing standards.

The fifth category, **Writing Style** (6 files), addresses language-level concerns: grammar and punctuation rules specific to academic writing, citation and reference formatting, LaTeX formatting best practices, mathematical notation conventions, capitalization and acronym handling, and general writing habits such as avoiding vague language, maintaining consistent tense, and writing concise sentences.

These skill files are loaded into the system prompts of the relevant reviewer agents. Because they are plain markdown files, they are easy for researchers to read, edit, and extend without touching any code. Adding a new skill or updating guidance for a particular paper type requires only editing a markdown file.

## 6. Context Length Handling

Different LLM models have different context window sizes, and papers vary considerably in length. Rather than imposing hardcoded token limits that would be fragile across models, the system uses a progressive truncation strategy implemented in a wrapper function called `generateObjectWithRetry()`.

On the first attempt, the full prompt is sent to the model. If the API returns a context-length-exceeded error (detected by matching specific error message patterns), the system retries with the prompt truncated to 50% of its original length. The truncation preserves the first half and last half of the content, inserting a `[... truncated ...]` marker in the middle. If this second attempt also fails, the system retries with the prompt truncated to 25%. Non-context errors are thrown immediately without retry, avoiding unnecessary API calls for issues like authentication failures or rate limits.

This approach ensures that the LLM always sees as much of the paper as possible. For most papers with most models, the full content fits within the context window and no truncation occurs. For unusually long papers or models with smaller context windows, the system gracefully degrades rather than failing entirely.

## 7. Frontend and User Experience

The user experience is designed to be as simple as possible. The AI Tutor panel appears as a new tab in the Overleaf editor's sidebar rail. The workflow consists of five steps: open the paper in Overleaf, click the AI Tutor tab, select a model from the dropdown, click "Run Full Review," and wait approximately 30 to 90 seconds for results. The panel displays a progress indicator during the review, then shows the paper type classification, a review summary, and a file-by-file list of comments with severity indicators.

When the user clicks "Apply Comments," the system injects the comments into Overleaf's native review panel using the ShareJS operational transformation protocol. Each comment creates a thread with the AI Tutor's feedback as the first message, highlighted over the exact text span identified by the reviewer agent. These comments are fully functional Overleaf comments: collaborators can see them in real time, authors can reply to them, and resolved comments can be dismissed. The comments are visually identical to human-authored comments, providing a seamless experience.

For multi-file projects, comments are grouped by source file. The application process opens each file sequentially, applies that file's comments, and moves to the next. This ensures that comments are correctly positioned even in projects that split content across many TeX files using `\input` and `\include` directives.

## 8. Robustness and Error Handling

Production reliability is a core design concern. The system implements multiple layers of error handling. Zod schema validation on all LLM outputs ensures that malformed responses are caught immediately rather than causing downstream errors. The `Promise.allSettled()` concurrency model ensures that individual agent failures do not cascade to other agents. Two-minute timeouts on each agent prevent any single slow LLM call from blocking the entire review. Comments with `highlightText` that cannot be found in the document are silently skipped rather than causing errors. The `buildSectionMapping()` function includes keyword-based fallback heuristics for sections that the classification LLM fails to assign. The `collectSectionContent()` function falls back to partial string matching when exact section title matches fail. Missing skill files produce warning logs but do not prevent the system from operating.

## 9. Future Directions

Several extensions are planned. The most significant is multimodal review: the infrastructure already includes a `textOnly` boolean field on each agent definition, and the figures and tables skill files include `[MULTIMODAL]` tags marking content that will be activated when the system can process compiled PDF page images alongside LaTeX source. This will enable the Figures and Captions reviewer to assess actual figure appearance, color palette choices, chart type appropriateness, and visual clarity.

Other planned extensions include learning from real reviewer feedback by mining OpenReview comments to improve prompt quality, supporting additional LLM providers beyond OpenAI, implementing iterative review tracking across paper revisions, developing a Chrome extension alternative for users of the hosted Overleaf service, and building an internal anonymous lab review system where team members can provide constructive pre-submission feedback.

## 10. Conclusion

The AI Tutor project represents a new approach to automated paper review that prioritizes actionability, specificity, and integration with the writing workflow. By combining multi-agent specialization, a rich expert skill library, paper-type-aware dynamic guidance, and deep integration with the Overleaf editor, the system aims to bridge the gap between surface-level grammar checking tools and the deep, structural feedback that senior researchers provide. The four-phase pipeline design balances efficiency (regex parsing and string matching where possible) with intelligence (LLM-based classification and review where necessary), while the robust error handling and progressive context management ensure reliable operation across diverse papers and models.
