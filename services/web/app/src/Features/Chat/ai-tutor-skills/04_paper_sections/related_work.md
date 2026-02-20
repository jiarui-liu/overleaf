# Writing the Related Work Section

[TEXT — no multimodal needed]

## Step 0: Determine Your Topics

Think about three research areas that are most relevant to the paper. Then structure as:

```latex
\section{Related Work}
\paragraph{Related Topic 1}
\paragraph{Related Topic 2}
\paragraph{Related Topic 3}
```

## Step 1: Gather All the "Ingredients"

**Prerequisite:** A thorough literature review has been done (see `01_setup/finding_prototype_papers.md` for search actions).

1. Add BibTeX entries ideally from dblp.org, renamed to follow Google Scholar alias style, like "jin2024causal".
2. Think of a list of 5-10 important papers very relevant to the paper.
3. Prepare "raw materials" by writing 1 sentence about each of them.

## Step 2: Make Them into a Fluent Paragraph

The main spirit is to **write like a history book.** Follow this structure:

**Sentence 1:** Define the task of XXX.

**Sentence 2:** Traditionally, this task is solved by XX type of methods, such as {Method 1} (cite1), {Method 2} (cite2), {Method 3} (cite3).

**Sentence 3:** Recently, {talk about a new trend} (cite, cite, cite, cite).

**Sentence 4 (introduce nearest neighbors):** For example, {authors} investigates ....

**Last sentence:** However, our work is distinct from them, because XXX.

## Placement of Related Work

There are two common placements for the Related Work section:

- **Near the beginning** (after Introduction): Use this if the related work discussion is brief but detailed, or requires defensive positioning early on.
- **Near the end** (before Conclusion): Use this if it can be summarized quickly and requires technical context from your own paper to be understood. This lets you present your contribution first before comparing to others.

## Compare and Contrast

The goal of Related Work is not just to describe what other papers do — the goal is to **compare and contrast**. For each related work:
- How does their approach differ in either assumptions or method?
- If their method is applicable to your problem setting, there should be a comparison in the experiments section.
- If not, there needs to be a clear statement why that method is not applicable.

## What Related Work Covers

Related Work covers the paper's "academic siblings" — alternative attempts in the literature at solving the same problem. This is distinct from a Background section, which covers "academic ancestors" (concepts and prior work required for understanding the method).

Related work is important for two reasons:
- To **credit members of the community** for their work and the influence it had, even if their work is not used directly.
- To **help new members of the community** find their way in the field.

## Caution

With "Related Work" we should be a bit more careful as there will be a significant number of references which contextualize the work.

## Improvement Prompting Template

```
Your task is to improve the following related work section:
<<related work text here>>

Please focus on:
1. The logical flow between paragraphs and topics.
2. Whether each paragraph follows the recommended structure (define task, traditional methods, recent trends, nearest neighbors, distinction from our work).
3. Grammatical and stylistic improvements.
4. Whether the section reads like a history book chronicling the development of the field.

Do NOT add, remove, or modify specific citations, as you may not have access to the cited papers.
```
