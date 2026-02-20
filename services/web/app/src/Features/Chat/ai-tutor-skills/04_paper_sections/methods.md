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
