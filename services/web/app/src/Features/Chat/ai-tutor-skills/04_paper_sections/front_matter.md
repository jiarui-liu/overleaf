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
- `\footnote{Preprint, {{CURRENT_YEAR}}. Under review.}` on the first non-anonymous page, OR
- A title-block remark like `Preprint. Submitted {{CURRENT_YEAR}}.`

**Flag if:**
- No first-page footnote indicates preprint status.
- The footnote shows a stale year (e.g., "Preprint 2023" when the current year is {{CURRENT_YEAR}}).
- The footnote uses "DRAFT" or "Do not distribute" placeholders left over from earlier drafts.

**Anonymous submission exception:** anonymous double-blind versions should NOT include a "Preprint {{CURRENT_YEAR}}" footnote — the venue formatting package handles that. Do not flag in that case.