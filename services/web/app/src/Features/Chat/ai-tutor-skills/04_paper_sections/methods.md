# Writing the Methods Section

[TEXT — no multimodal needed]

## Page Budget

Methods is typically the section where you describe your contributions. Together with experiments, this is the bulk of the paper. Methods sections often begin on pages 2-3. If Methods starts on page 4+, that is a signal that the preceding sections are too long and need trimming.

## Questions the Methods Section Should Address

- How do we solve the problem that the paper is tackling?
- Why do we solve it in this way?
- How can a user figure out when to apply our solution?
- How should a user assess the quality of the solution?
- Are there practical considerations in real-world settings?
- Are there simple abstractions that help understand the solution strategy?

## Background vs. Methods

If the paper requires explaining prerequisite concepts before presenting the method, consider a **Background** section covering "academic ancestors" — all concepts and prior work required for understanding the method. This typically includes the **Problem Setting** with formal notation. If the paper introduces a novel problem setting as a contribution, it deserves its own separate section rather than being embedded in Background.

## Key Principles

### Pseudo-Code Readability
Can the reader understand our text as if they are reading pseudo codes?

### Justification for Design Choices
Do we have enough justification for each design choice in the method?

### Intuition Before Formalism
Convey the intuition first — once the reader has the intuition, they can follow the details, but not vice versa. Use concrete examples to introduce the problem and the idea before diving into formal notation.

### Use Running Examples
When possible, use a running example throughout the section that readers can follow as they work through the method.

### Top-Down Descriptions
Describe methods top-down so readers understand where the content is heading before getting into the specifics.

### Define Notation Early
Define all variables and notation before use. Group global definitions in a Preliminaries subsection if many terms need introduction.

### Linear Logical Flow
The section should have a linear, logical flow, building up intuitions and methods piece by piece. All ideas should be described using the formalism introduced in the Problem Setting and building on concepts from Background.

## Improvement Prompting Template

```
Your task is to improve the following Methods section:
<<methods_section>>

Here is the guidance for a good Methods section:
- **Reproducibility**: Is there enough detail to reimplement the method?
- **Justification**: Is it clear *why* specific design choices (e.g., architecture, loss function) were made?
- **Notation**: Is notation defined clearly and used consistently?
- **Intuition**: Does the text provide high-level intuition before diving into equations?

Critique the section based on these criteria.
Then, suggest concrete improvements, such as:
1.  Adding a "Preliminaries" subsection for notation.
2.  Clarifying the "why" behind a specific equation.
3.  Adding a running example.
```

## How to Critique the Methods Section (Based on ICLR 2025 Reviews)

### 1. Clarity and Notation
**Reviewer Insight:** Confusion is the enemy.
- **Bad Example (Critique):** "Notation is dense... terms are not clearly defined... e.g. Algorithm 1, line 275, what is a_BB_surv?"
- **Good Example (Praise):** "The paper is well-written... The method is clearly explained." "Using clear mathematical definitions and visual aids."
- **Action:** Flag undefined variables. Demand a "Preliminaries" section if notation is heavy.

### 2. Justification of Design Choices
**Reviewer Insight:** Reviewers hate "magic" numbers or ad-hoc modules.
- **Bad Example (Critique):** "The method feels very ad-hoc... It is not clear what is the benefit of the presented method against simply using a sliding window." "Why is specific normalization chosen? Why is this beneficial?"
- **Good Example (Praise):** "The proposed method is solid... with enough technical contributions." "The insight to make the process end-to-end differentiable is both creative and practically useful."
- **Action:** For every major component (loss function, architecture block), ask: "Why this and not the standard alternative?"

### 3. Theoretical Grounding
**Reviewer Insight:** Methods needs a reason to work, not just empirical luck.
- **Bad Example (Critique):** "There is a lack of theoretical grounding as to the benefits of the components."
- **Good Example (Praise):** "We provide a theoretical analysis within deep linear networks, establishing a strong foundation."

