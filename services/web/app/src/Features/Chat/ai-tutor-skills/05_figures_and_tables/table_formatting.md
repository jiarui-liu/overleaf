# Table Formatting

[TEXT for rule checking; MULTIMODAL for visual inspection of tables]

## Professional Table Style

Professional writing does not allow vertical bars in any table — only horizontal lines are allowed.

You also need to check out many other tips about formatting tables for scientific papers, e.g., left/center alignment, etc.

## LaTeX Table Template

```latex
\usepackage{booktabs}

\begin{table}[t]
\centering
\caption{Your caption here. Abbrev: Full Name.}
\begin{tabular}{lcc}
\toprule
Method & Metric 1 & Metric 2 \\
\midrule
Baseline 1 & 70.2 & 65.3 \\
Baseline 2 & 72.1 & 67.8 \\
\textbf{Ours} & \textbf{78.5} & \textbf{73.2} \\
\bottomrule
\end{tabular}
\end{table}
```
