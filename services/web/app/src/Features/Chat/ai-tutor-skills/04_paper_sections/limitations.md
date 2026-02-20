# Writing the Limitations Section

[TEXT — no multimodal needed]

## Why Write a Limitations Section?

A strong Limitations section builds trust. It shows that you have a deep understanding of your method, including where it breaks. Reviewers often appreciate honesty over overselling. If you don't state the limitations, reviewers will find them for you—and they will be less forgiving.

## Types of Limitations

### 1. Scope Limitations (What we didn't do)
Clarify the boundaries of your study.
*   "We focus on English-only text..."
*   "We evaluate on synthetic benchmarks, which may not fully reflect real-world noise..."

### 2. Method Limitations (Where it fails)
Describe scenarios where your method performs poorly or assumes conditions that might not hold.
*   "Our method requires O(N^2) memory, making it unsuitable for sequences longer than 4k tokens."
*   "The approach relies on accurate pose estimation; if the upstream estimator fails, our method cannot recover."

### 3. Resource/Scale Limitations
*   "Due to computational constraints, we only compare against models up to 7B parameters."

## Examples from High-Quality Papers

**Example 1: Methodological Constraints**
> "Although Learning to Defer (L2D) has demonstrated state-of-the-art performance... it entails a severe limitation: all human experts must annotate the whole training dataset... resulting in a time-consuming and expensive annotation process."

**Example 2: Evaluation Scope**
> "A notable limitation is that the paper places more emphasis on the speed of sampling rather than the quality... we do not provide an in-depth analysis of the trade-off between sampling speed and output quality."

**Example 3: Assumption Validity**
> "The obvious limitation is that the underlying polyhedral complex is fixed. There are no bounds shown for the number of pieces in the minimal decomposition."

## Connection to Future Work

Limitations often point directly to Future Work.
*   *Limitation:* "We only support static graphs."
*   *Future Work:* "Extending this to dynamic graphs is a promising direction."

## Improvement Prompting Template

```
Your task is to critique and improve the following Limitations section:
<<limitations_section>>

Here is the guidance for a good Limitations section:
- **Honesty**: Does it clearly state where the method fails or is less effective?
- **Scope**: Does it define the boundaries of the work (e.g., specific languages, datasets)?
- **Constructiveness**: Does it frame limitations as opportunities for future work rather than just flaws?
- **Specificity**: Are the limitations specific to this method, or generic (e.g., "more compute is better")?

Provide a critique of the current section based on these criteria.
Then, suggest concrete improvements or additions. If the section is empty or missing, suggest 3 potential limitations based on the context of the paper (if known) or general common limitations in this field.
```
