# Table Formatting — APA 7th Edition Style

[TEXT for rule checking; MULTIMODAL for visual inspection of tables]

## Table Number

Every table must have a bold number above the title: `\textbf{Table 1}`, `\textbf{Table 2}`, etc.
Number tables sequentially by order of first mention in the text.
Flag if: table number is missing, numbers skip or are out of order.

## Table Title

Place the title one line below the table number. It must be:
- Italicized: `\textit{...}` or `\emph{...}`
- Title case (capitalize major words)
- Brief but descriptive — explain the table's content, not just "Results"
- No period at the end

Flag if: title is missing, not italicized, uses sentence case, or is too generic (e.g., "Data", "Results", "Summary").

## Column Headings

- Center all column headings
- Use sentence case for heading text
- The leftmost column MUST have a stub heading (e.g., "Variable", "Method") — never leave it blank
- Use `\cmidrule{2-4}` for grouped sub-column spanners (decked heads)

Flag if: leftmost column has no heading, headings use inconsistent casing.

## Body Alignment

- Left-align the leftmost (stub) column
- Center numeric data in other columns, or left-align text-heavy content
- Align decimal points within a column when presenting numerical results
- Use consistent decimal precision within each column

## Table Notes

Place notes below the table using the `threeparttable` package. Three note types, always in this order:

1. **General note**: `\textit{Note.}` — applies to the whole table (define abbreviations here)
2. **Specific note**: superscript letters (a, b, c) — explain individual cells or rows
3. **Probability note**: `*\textit{p} < .05. **\textit{p} < .01. ***\textit{p} < .001.`

Flag if: abbreviations appear in the table but are not defined in a note.

## Borders and Lines (Critical)

Only these horizontal rules are allowed:
- `\toprule` — top border, above column headings
- `\midrule` — below column headings
- `\cmidrule` — below column spanners (grouped headings)
- `\bottomrule` — bottom border, below last data row or notes

Violations to flag:
- Vertical bars (`|`) in `\begin{tabular}{...}` column specification
- `\hline` used anywhere — must use booktabs commands exclusively
- Borders around individual cells
- Any other decorative horizontal lines

## Placement and Cross-References

- Embed the table in the text immediately after its first mention, or place each table on a separate page after the references
- Every table MUST be referenced at least once in the body text (e.g., "as shown in Table 1")

Flag if: a table is never referenced in the text.

## APA-Compliant LaTeX Template

```latex
\usepackage{booktabs}
\usepackage{threeparttable}

\begin{table}[t]
\begin{threeparttable}
  \textbf{Table 1}\\
  \textit{Performance Comparison Across Baseline Methods}
  \begin{tabular}{lcc}
  \toprule
  Method & Accuracy & F1 Score \\
  \midrule
  Baseline A\textsuperscript{a} & 70.2 & 65.3 \\
  Baseline B & 72.1 & 67.8 \\
  \textbf{Ours} & \textbf{78.5} & \textbf{73.2} \\
  \bottomrule
  \end{tabular}
  \begin{tablenotes}[flushleft]
    \small
    \item \textit{Note.} Accuracy and F1 are reported on the test split.
    \item \textsuperscript{a} Baseline A uses a smaller training set.
    \item * \textit{p} < .05. ** \textit{p} < .01.
  \end{tablenotes}
\end{threeparttable}
\end{table}
```
