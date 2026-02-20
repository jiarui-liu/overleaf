# Writing Captions for Figures and Tables

[TEXT — no multimodal needed]

## Abbreviation Rule

Each abbreviated heading in a figure or table should be introduced (defined) in the caption.

## Self-Contained Captions

The figure/table + caption package should be self-contained — understandable to someone in your field without reading the full paper. Determine the intended message before creating the visualization.

## First Sentence Should Be a Statement, Not a Description

The first sentence of a caption should state the figure's key trend or message — not just describe what is shown. Tell the reader what they should expect to find.

**Good:**
```latex
\caption{SGD with momentum optimizes the training loss faster than SGD without momentum.}
```

**Bad:**
```latex
\caption{Training losses with and without momentum.}
```

## Explaining Figures and Tables in Text

- Always describe the significance of each figure and table within the manuscript text.
- Explain why the visualization is included and what its implications are.
- Do not introduce a figure or table and then immediately change subjects without interpreting it.
