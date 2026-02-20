# LaTeX Formatting

[TEXT — no multimodal needed]

## Cleveref Package for Cross-References

Always use the cleveref package when referencing tables/figures/equations:

In the header:
```latex
\usepackage{cleveref}
\crefname{figure}{Fig}{Figs}
\crefname{table}{Table}{Tables}
\crefname{appendix}{Appendix}{Appendices}
\crefname{section}{Section}{Sections}
\crefname{equation}{Eq.}{Eqs.}
```

Inside the main document:
```latex
\cref{tab:main_results}
\cref{appendix:aaa,appendix:bbb}  % for plurals
```

## Acronym Packages

There are LaTeX packages to enforce consistent acronym usage (e.g., `acronym` or `glossaries` package). See `05_writing_style/capitalization_and_acronyms.md` for abbreviation rules.

## Paper Section Ordering

The standard order for the final sections is:

```latex
\section{Conclusion}
```
— The page limit usually counts until the end of "Conclusion" —

```latex
% Comment this out when submitting the anonymous version:
\section*{Acknowledgment}

\section*{Limitations}
% Note: These sections are not numbered, thus with "\section*{..."

\section*{Ethical Considerations}
```
— No page break. Immediately follow with references. —

References

```latex
\cleardoublepage
```

Appendix

## Anonymous Submission Rules

- For anonymous submissions, Acknowledgement is not allowed — comment it out.
- At the end of the abstract, add `\footnote{We will open-source our data and code upon acceptance.}`
- If sharing code for review, use anonymous hosting services like anonymous.4open.science.

## LaTeX Best Practices

### Quotation Marks
Use `` and '' (two backticks and two single quotes) for double quotes in LaTeX, not keyboard quotation marks. You can also use `\enquote{text}` from `\usepackage{csquotes}` which automatically adjusts to the language.

### Hyperref with Backref
Use `\usepackage[backref=page]{hyperref}` instead of simply `\usepackage{hyperref}` to make it easier for readers to jump to references and back.

### Automatic Numbering
Use `\label` and `\ref` (or `\cref`) for sections, tables, figures, and equations. This manages numbering automatically as you edit.

### Positional References
Do not use "above" and "below" to refer to figures and tables, since LaTeX placement is unpredictable. Use `\cref` references instead.

### Proofread the PDF
Always proofread the typeset PDF output, not just the LaTeX source code — rendering often differs from source in unexpected ways. Check for broken references (indicated by "??").

### Fill the Page Limit
Fill the page limit and avoid poor formatting or whitespace. Empty space looks lazy. Avoid line breaks or paragraphs that result in lines containing a single (or few) words.

### Comments
Use `%` for commenting out text rather than leaving visible notes in the manuscript that you might forget to remove.

### Appendix Content
Appendices should not contain any material necessary for understanding the contributions — but should contain detailed proofs, algorithms, and other details that readers typically skip.
