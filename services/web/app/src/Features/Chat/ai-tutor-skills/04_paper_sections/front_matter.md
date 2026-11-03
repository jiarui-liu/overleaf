# Front Matter — Title Block, Authors, Affiliations, First-Page Footnote

[TEXT — no multimodal needed]

The top of the paper (title, authors, affiliations, and first-page footnotes) is the first thing a reviewer or reader sees. Two common mistakes are missing contact information and a missing or stale "preprint" footnote.

## Author Contact: Emails

A non-anonymous paper MUST list at least one author email so readers and reviewers can reach the authors.

**What to check:**
1. The `\author` block (or `\affiliation`, `\email`, `\thanks`) contains at least one email address.
2. Emails are formatted with `\texttt{}` or `\href{mailto:...}{...}` for clickability.
3. If there are multiple authors, either each author has an email, or the corresponding author is clearly marked.

**Acceptable patterns:**
- `\thanks{Correspondence to \texttt{alice@example.edu}.}`
- `\author{Alice \\ \texttt{alice@example.edu} \and Bob \\ \texttt{bob@example.edu}}`
- ACL/NeurIPS-style `\affiliation` followed by an email line.

**Flag if:**
- No email appears anywhere in the title block.
- The paper uses placeholder emails like `firstauthor@example.com` in a non-anonymous version.

**Anonymous submissions exception:**
If the document is anonymous (e.g., ICLR/NeurIPS double-blind submission — detect via author block strings like "Anonymous Authors" / "Author Names Removed for Review", or via venue style files like `iclr2026_conference` without `\iclrfinalcopy`), emails should NOT be present. Do not flag missing emails in that case.

## First-Page Footnote: Preprint Year

Non-anonymous arXiv preprints should declare their preprint status in the first footnote of the first page. The current year is **{{CURRENT_YEAR}}**.

**Expected pattern:**
- `\thanks{Preprint, {{CURRENT_YEAR}}.}` attached to the title or first author, OR
- `\footnote{Preprint, {{CURRENT_YEAR}}.}` on the first non-anonymous page.

The note says "Preprint" and nothing more. An arXiv version must never say the paper is under review or name the venue it was submitted to.

**Flag if:**
- No first-page footnote indicates preprint status.
- The footnote shows a stale year (e.g., "Preprint 2023" when the current year is {{CURRENT_YEAR}}).
- The footnote or title block says "Under review", "Submitted to <venue>" or "Under submission" (including the `\iclrfinalcopy`-less "Under review as a conference paper" header). Suggest replacing it with `Preprint, {{CURRENT_YEAR}}.`
- The footnote uses "DRAFT" or "Do not distribute" placeholders left over from earlier drafts.

**Anonymous submission exception:** anonymous double-blind versions should NOT include a "Preprint {{CURRENT_YEAR}}" footnote — the venue formatting package handles that. Do not flag in that case.

## Spacing Between Authors and Affiliations

When affiliations are listed on their own lines below the author names (superscript style), the two blocks often run together. Suggest a small vertical gap, e.g. `\vspace{0.5em}` (or `\\[0.5em]`), between the last author line and the first affiliation line so the reader can tell names from institutions at a glance. Do not suggest it when the venue template lays out authors and affiliations itself (e.g. `\And`/`\AND` blocks in ACL, `\icmlaffiliation` in ICML).
