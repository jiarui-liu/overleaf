# Writing the Ethical Considerations Section

[TEXT — no multimodal needed]

## Format

This section is not numbered: use `\section*{Ethical Considerations}`.

## Tips

- Always remember to write the Ethical Considerations section.
- For anonymous submissions, this section should still be included.
- Extra space beyond the page limit is provided for this section (after the 8th page for regular papers, 4th page for short papers).
- If uncertain whether an ethics section is needed, include one.

## ACL Ethics FAQ Guidelines

Papers must comply with the ACL Code of Ethics (based on the ACM Code of Ethics). Papers may be rejected on ethical grounds if they violate this code or inadequately address legitimate concerns.

### Ethics Review Process

- Reviewers assess papers using specific ethics questions.
- Flagged papers receive further review by an Ethics Advisory Committee.
- The EAC may recommend acceptance, conditional acceptance (with required revisions), or rejection.
- Camera-ready versions of conditionally accepted papers are re-reviewed for ethics compliance.

### For Dataset Papers

- Verify ethical data collection consistent with terms of use, intellectual property, and privacy rights.
- Document collection processes and fair compensation for annotators.
- Indicate IRB approval if applicable.
- Describe dataset characteristics and relevant speaker populations.
- Address potential quality issues and associated risks.

### For NLP Applications

Authors should examine:
- **Intended use:** Who benefits and who might be harmed?
- **Failure modes:** How could system failures cause harm?
- **Biases:** What dataset and model biases exist and how do they contribute to failures?
- **Misuse potential:** What harmful applications are possible?
- **User data collection:** What risks arise if systems learn from user input?
- **Vulnerable populations:** Do harms disproportionately affect marginalized groups?

### For Papers Using Demographic Data

- Avoid attributing identity characteristics without consent; use self-identification when possible.
- Acknowledge data sources and ethical implications of categorization.
- Consult institutional review boards for research involving human subjects.
- Justify identity characteristic choices relative to research questions.

### For Computationally Intensive Research

Discuss energy and carbon costs by:
- Using tools like the Experiment Impact Tracker to estimate energy requirements.
- Providing computing platform and runtime information when precise data is unavailable.
- Suggesting methods to reduce computational costs.
