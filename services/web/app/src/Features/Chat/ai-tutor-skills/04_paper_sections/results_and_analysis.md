# Writing the Results and Analysis Sections

[TEXT — no multimodal needed for structure; MULTIMODAL for reviewing actual figures/tables]

## Experimental Setup

Before presenting results, explicitly lay out:
- An overview of the **Goals** or **Questions** that the experimental setup is tackling.
- Any instantiation or implementation details that are common to all experiments (e.g., learning rates, batch sizes, dataset details, etc.).

Example LaTeX pattern:
```latex
In our experiments, we aimed to:
\begin{inlinelist}
\item verify our theoretical results in practice;
\item investigate our proposed method in practical settings;
\item take advantage of pretrained models to achieve strong performance.
\end{inlinelist}
Unless stated otherwise, we consider [common setup details].
For experimental details and additional results see \cref{appcs:exp_details,appcs:exp_results}.
```

## High-Level Structure of a Results Section

Let the reader know what to expect before they dive into subsections and all the results.

### If There Is Only One Result Section

- Summarize the key findings upfront.
- Form Research Questions (RQs) to organize subsections.
- Have a bold phrase at the start of each paragraph, if there are multiple paragraphs in a subsection.

### If There Are Multiple Result Sections

**Effort 1:** Already hint at it in the abstract, including referring to the sections.

**Effort 2:** Before diving into all the analysis, have a dedicated section or the start of a section that prepares the reader for what to expect across multiple sections. Motivate why all of them are needed to provide a multi-faceted analysis.

**Note:** Prepare for reviewers complaining about the structure being unclear, as most people by default expect only one results section.

## Writing Each Analysis Section

### Structure 1 for Each RQ
- **Sentence 1:** Function of this RQ, i.e., why do we investigate it?
- **Sentence 2:** What are we reporting? Describe the setup to generate the figure or statistics.
- **Sentence 3:** Overall findings, with references to figures and tables.
- **Sentence 4:** Special notes (if applicable).

### Structure 2 for Each RQ
```latex
\paragraph{Method.}
```
Use this if the method is a contribution on its own, or very different from previous RQs.
```latex
\paragraph{Results.}
```

### Subsection Title Styles

There are two effective styles for experimental subsection titles:

**Style A — Answer, Elaboration:** The title is a short, take-home conclusion (an answer to the question being addressed). The first sentence refers to the figure, and the rest elaborates.

```latex
\textbf{Composing different augmentations is beneficial across datasets.}
The highest accuracy in Figure \ref{fig:heatmap} always comes from
off-diagonal entries, i.e., composition of different augmentations...
```

**Style B — Question, Answer:** The title is a short-form question. The first sentence refers to the figure and states the answer, and the rest elaborates.

```latex
\textbf{Do our representations transfer better than supervised?}
As shown in Figure \ref{fig:transfer}, we found that our SSL models
generally transferred better than the supervised baseline...
```

## Interpreting Each Figure/Table

### Structure for Interpreting a Figure/Table

**Sentence 1:** Content + figure reference.

**Sentence 2:** Overall finding.

**Sentence 3:** Focus on a specific aspect, call out some phenomena.

### Alternative: Multiple Findings Structure

"Here we present three major findings on xxx:"
```latex
\textit{Finding 1. one sentence summary}. Descriptions supporting it referencing Table/Figure X.
\textit{Finding 2. one sentence summary}
\textit{Finding 3. one sentence summary}
```

## What to Measure in Experiments

When presenting performance experiments, consider reporting:
- Pure running time
- Parameter sensitivity
- Scalability
- Absolute performance
- Relative performance to naive approaches
- Relative performance to previous approaches
- Relative performance among your own proposed approach variants

## Important Considerations

- Compare to baselines mentioned in Related Work.
- Include statistics and confidence intervals where appropriate.
- Include statements on hyperparameters and fairness of comparisons.
- Include ablation studies to show that specific parts of the method are relevant.
- Use past tense when describing what you did in experiments or what happened in experiments.
