# Writing Section 1: Introduction

[TEXT — no multimodal needed]

## Critical Importance

By the time a referee has finished the Introduction, they have probably made an initial decision about whether to accept or reject the paper. A clear new important technical contribution should have been articulated by the time the reader finishes page 3.

## Paragraph-by-Paragraph Structure

The introduction should address five main questions: What is the problem? Why is it interesting? Why is it challenging? What have previous people done? What do we propose?

**Paragraph 1:** "What is the problem" and "Why is the problem interesting."

**Paragraph 2:** "Why is it challenging" and "What have previous people done."

**Paragraph 3:** We introduce what we propose in the work. Usually describe the technical methods.

**Paragraph 4:** Describe the experimental findings.

**Lastly:** Highlight the list of contributions using bullet points, to make it a stronger case for this paper to be accepted. Nail your contributions early — readers should know exactly what is new.

## The WHAT-WHY-HOW Figures

The introduction should be accompanied by three types of figures:

**WHAT figure (the "teaser"):** Shows only two things — (1) Input and (2) Output. This helps the reader immediately understand what the work is about. Extra points for having Figure 1 on the first page.

**WHY figure:** Provides the motivation. The best WHY figure illustrates the existing work's core issue or problem with a concrete example, showing alternative design options and their drawbacks.

**HOW figure:** Describes how the method works. Tips:
- Link all sections of the method
- Use consistent notations
- Write a self-contained caption
- Visualize the variables
- Structure as a cascade of small units: "Input → some processing → Output" (think computational graph)

With the WHAT-WHY-HOW figures, the introduction is ready to answer the five questions.

## Storytelling Approach

Writing the introduction can be like telling a Hollywood story:
- **The Setting:** What problem we are solving; how important it is.
- **The Villain:** How difficult this problem is; how previous work cannot solve it well.
- **The Superhero:** What we propose.

## Example of a Well-Written Introduction

**Paragraph 1** — "What is the problem" and "Why is the problem interesting":

"Reasoning is the process of using existing knowledge to make inferences, create explanations, and generally assess things rationally by using logic (Aristotle, 1991). Human reasoning is, however, often marred with logical fallacies. Fallacious reasoning leads to disagreements, conflicts, endless debates, and a lack of consensus. In daily life, fallacious arguments can be as harmless as 'All tall people like cheese' (faulty generalization) or 'She is the best because she is better than anyone else' (circular claim). However, logical fallacies are also intentionally used to spread misinformation, for instance 'Today is so cold, so I don't believe in global warming' (faulty generalization) or 'Global warming doesn't exist because the earth is not getting warmer' (circular claim)."

**Paragraph 2** — "Why is it challenging" and "What have previous people done":

"In order to detect such fallacious arguments, we propose the task of logical fallacy detection. Logical fallacy detection methods can be helpful to tackle important social problems. For instance, these methods can be combined with fact-checkers (Riedel et al., 2017; Thorne et al., 2018) for misinformation detection as many claims can be factually correct but still fallacious. However, logical fallacy detection is challenging as it requires a model to discover egregious patterns of reasoning (Johnson and Blair, 2006; Damer, 2009)."

**Paragraph 3** — What we propose:

"To address this pressing need and encourage more work to detect reasoning flaws, we construct a dataset of logical fallacies consisting of general logical fallacies (LOGIC), and a challenging extrapolation set of climate claims (LOGICCLIMATE), as shown in Figure 1. We find that this task is challenging for 12 pretrained large language models, whose performances range from 8.62% to 53.31% micro F1 scores on the LOGIC dataset."

**Paragraph 4** — Experimental findings and proposed method:

"By analyzing our collected dataset, we identify that logical fallacies often rely on certain false patterns of reasoning. For example, a typical pattern in false causality in Figure 1 is 'alpha co-occurs with beta => alpha causes beta.' Motivated by this, we develop an approach to encourage language models to identify these underlying patterns behind the fallacies. In particular, we design a structure-aware model which identifies text spans that are semantically similar to each other, masks them out, and then feeds the masked text instances to a classifier. This structure distillation process can be implemented atop any pretrained language model. Experiments show that our model outperforms the best pretrained language model by 5.46% on LOGIC, and 4.51% on LOGICCLIMATE."

**Contributions list:**

"In summary, this paper makes the following contributions: 1. We propose a new task of logical fallacy classification. 2. We collect a dataset of 2,449 samples of 13 logical fallacy types, with an additional challenge set of 1,109 climate change claims with logical fallacies. 3. We conduct extensive experiments using 12 existing language models and show that these models have very limited performance on detecting logical fallacies. 4. We design a structure-aware classifier as a baseline model for this task, which outperforms the best language model. 5. We encourage future work to explore this task and enable NLP models to discover erroneous patterns of reasoning."

## Improvement Prompting Template

```
Your task is to improve the following introduction:
<<introduction here>>

Here is the guidance for producing a suitable introduction:
<<guidance from the Structure section above>>

Here is an example of a well written introduction which conforms to the guidance:
<<example from above>>

First, discuss any high-level structural changes and grammatical or stylistic issues. Second, discuss whether any elements of the overall proposal or argument might be missing. Third, highlight any extraneous text or points that can be removed and how the work can be made concise. Only introduce alterations that can explicitly improve the whole text and aim to keep the overall argument that the author is trying to put across.

Finally, output the improved text altogether.
```
