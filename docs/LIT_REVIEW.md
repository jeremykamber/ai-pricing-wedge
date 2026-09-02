Jeremy Kamber  
Professor Jeremy Zaretzky  
INFO 499  
4/26/26

# **Literature Review: Inference-Time Methods for High-Fidelity LLM Persona Construction**

## **1\. Introduction**

The problem of making a language model reliably act like a specific person—rather than a generic, helpful assistant—is a core challenge in user research and behavioral simulation. Historically, approaches to this problem fell into two camps. On one end, rule-based systems like ELIZA (1966) and PARRY (1972) achieved narrow persona simulation through hard-coded response logic, but collapsed outside their curated domains because they were not generalizable (Rajaraman, 2023). On the other, fine-tuning methods like Character-LLM (Shao et al., 2023\) and alignment techniques like Direct Preference Optimization (Rafailov et al., 2023)—DPO for short—achieved higher behavioral fidelity at the cost of compute.

This review covers a third path: inference-time persona construction. At inference time, what gets stuffed into the context window, and how that "stuff" is structured is the main—some might argue the *only*—lever to pull. This constraint represents a practical reality for applications that can't afford to retrain a model for every new persona, or that need to generate personas on the fly from raw input data (e.g., interview transcripts).

The central question is straightforward: given an LLM with frozen weights (so, no more training being done), what prompt structures, grounding data, and architectural patterns produce the most behaviorally accurate representation of a target individual or demographic? The answer depends on the depth and structure of the conditioning context, the method used to extract and encode that context from source material, and the mechanisms employed to prevent the persona from decaying over extended interaction.

This review is organized into eight sections (including this one). Section 2 covers the construction of narrative backstories from seed data, the foundational layer of persona conditioning. Section 3 examines structured prompt architectures for persona specification. Section 4 addresses the transcript-to-persona extraction pipeline (the critical engineering bridge between raw qualitative data and machine-readable identity representations). Section 5 surveys grounding methods, including few-shot demonstrations and retrieval-augmented generation. Section 6 covers multi-turn consistency maintenance without external memory. Section 7 reviews evaluation frameworks for inference-time persona fidelity. Section 8 situates the empirical findings within theoretical models of how LLMs represent and simulate personas. Section 9 concludes with implications for practice.

## **2\. Backstory Construction from Seed Data**

Every persona begins as seed data—this can take the form of demographic variables, survey responses, interview transcripts, or behavioral logs. The method by which these seeds are expanded into a usable conditioning context is the primary determinant of downstream fidelity. The literature draws a sharp distinction between two approaches: flat demographic injection and narrative backstory construction.

### 2.1 Flat Demographic Prompting

The simplest approach conditions the LLM on a list of demographic attributes (age, gender, race, education, income) as flat prompt parameters. Sun et al. (2024) formalized this as "Random Silicon Sampling" (RSS), where synthetic survey respondents are created by randomly drawing demographic profiles from a target population's distribution and prompting the model with those traits. On macro-level political opinion questions from the American National Election Studies (ANES), RSS achieved an average KL-divergence of 0.0004 against human response distributions (KL-divergence is a standard measure of how different two sets of responses are, where 0 means identical). This is quite good fidelity at the population level.

However, this aggregate accuracy masks a critical second-order failure. When Sun et al. (2024) examined subgroup performance, they found that RSS systematically polarized responses. Democratic and Republican simulated voters showed 99.96% and 99.22% support for their respective party's candidate, far exceeding real human polarization. The model defaulted to stereotypical representations of demographic intersections; the independent voter group (the most behaviorally complex) produced the poorest replication. Stratified analyses revealed that pure demographic prompting captures where a group stands on average, but not the dispersion of opinions within it. Since LLMs are so-called “stochastic parrots” and probabilistic, this makes perfect sense (Bender et al., 2021).

Moon et al. (2024) confirmed this limitation in a controlled comparison. Using demographic prompts derived from Pew Research Center's American Trends Panel (ATP), they measured how closely model responses matched human responses using two metrics: the Wasserstein distance (how much the groups' answer patterns differ, where lower is better) and Cronbach's alpha (how consistently individuals answer related questions, where higher is better). Demographic-only methods (which they termed "QA" and "Bio" prompting) underperformed narrative backstories by 12–18% on distributional alignment and 22–27% on internal consistency. The limitation is structural: demographic traits are correlates of behavior, not causes of it. A model prompted with "35-year-old Black female, college educated, suburban" has no coherent identity narrative to constrain its output distribution; it defaults to the most probable response given those traits in its training data, which is the stereotype.

### 2.2 Narrative Backstory Construction

Moon's dissertation (2025) develops this insight into a full framework. The "Anthology" method works in four stages: (1) generate a large pool of diverse first-person life narratives by prompting a pretrained LLM with "Tell me about yourself" at high sampling temperature; (2) administer a demographic survey to each backstory-conditioned persona to estimate its trait profile; (3) match personas to target human subjects using a matching algorithm (either maximum-weight or greedy) that aligns the most demographically similar personas to each human subject; (4) administer the target survey with each persona conditioned on its matched backstory plus appended demographic traits.

The mechanism behind backstory conditioning is worth stating explicitly. An LLM's pretraining corpus contains text from millions of distinct authors; the model learns to simulate what Andreas (2022) called a "mixture of voices." A system prompt is not teaching the model a new behavior; it is selecting one of these pre-existing voices from the model's latent space (the internal representational space where the model organizes everything it knows about language and concepts). Narrative backstories work because they provide rich, causally coherent constraints that narrow the range of responses the model considers plausible. Where a demographic prompt allows the model to fall back on the average of all the responses in its training data for that demographic intersection, a backstory forces the attention mechanism to condition on idiosyncratic experiential details (a specific childhood memory, a particular career arc, a set of lived values).

The empirical results bear this out. On ATP Wave 92 (political typology) and Wave 99 (technology and society), Anthology-conditioned personas achieved response distributions 14–18% closer to humans and internal consistency scores 22–27% higher than demographic baselines (Moon et al., 2024). In a follow-up study on partisan misperception (Moon, 2025, Chapter 3), backstory-conditioned LLMs reproduced the asymmetric hostility gap between Democrats and Republicans (the tendency for each party to overestimate the other's hostility) with effect sizes that were statistically indistinguishable from human data. Demographic-only methods failed to capture this asymmetry; they produced symmetrical rather than polarized out-group perceptions.

### 2.3 Structural Format and Fidelity Trade-offs

The format of the backstory creates measurable trade-offs. Moon et al. (2024) tested two variants: "natural" backstories (generated without presupposed demographics) and "demographics-primed" backstories (generated by prompting with a specific demographic profile). Natural backstories produced higher individual-level consistency; demographics-primed backstories achieved closer aggregate distributional match. The implication is that presupposing demographics during backstory generation introduces a subtle bias toward centroid representations (the same limitation that afflicts flat demographic prompting), while unconstrained generation allows more idiosyncratic (and thus more authentic) narrative variation.

Joshi et al. (2025) extended this work with the PB\&J (Psychology of Behavior and Judgments) framework, which augments backstories with LLM-generated rationales grounded in psychological scaffolds. Rather than simply generating a life narrative, PB\&J prompts the model to explain *why* a persona with certain demographics would hold certain beliefs, then incorporates those rationales into the conditioning context. This improved accuracy on judgment and decision-making tasks by 6–9% over backstory-only baselines. This suggests that explicit reasoning scaffolds help the model maintain causal coherence.

Two open problems remain. First, the scalability of narrative generation for underrepresented demographics: LLMs tend to generate backstories for minority groups that are less diverse and more stereotypical than those for majority groups, and the matching step (Section 2.1 of Moon, 2025\) only partially mitigates this. Second, the optimal length and density of a backstory is unknown; Moon's (2025) multi-turn interview method produces backstories exceeding 1,000 tokens, but whether this additional length improves fidelity beyond shorter narratives (or introduces attention dilution) has not been systematically tested.

## **3\. Structured Persona Prompting**

Given a backstory or set of seed characteristics, the prompt architecture through which they are delivered to the model determines how effectively they constrain behavior. The literature has converged on a set of design principles for inference-time persona prompts.

### 3.1 Compartmentalized Architectures

The highest-fidelity persona prompts use a compartmentalized structure that separates identity definition from behavioral constraints from task instructions. Wang et al. (2024b), in their survey of role-playing language agents, taxonomize these components: (1) *demographic anchoring* (age, gender, occupation, location); (2) *psychographic specification* (values, goals, fears, communication style); (3) *epistemic boundaries* (knowledge domains the persona does and does not have access to); (4) *behavioral guardrails* (response format constraints, refusal patterns, and conversational norms).

The theoretical justification for this separation comes from the transformer attention mechanism. When identity traits are mixed indiscriminately with task instructions in a flat prompt, the model suffers from what can be described as attention dilution: the immediate cognitive demands of the task (answering a question, completing a form) compete with the maintenance of persona constraints for the same attention budget. Separating identity and constraint modules into distinct prompt segments, each with clear delimiters, allows the model to allocate attention more efficiently.

### 3.2 Psychometric Grounding

Rather than relying on adjectives like "outgoing" or "methodical" (which are vague and subject to varying interpretations), advanced prompts anchor personas to established psychometric frameworks. Joshi et al. (2025) demonstrate that conditioning on Big Five (OCEAN) coordinates produces 6–9% better behavioral adherence than unstructured trait lists. The mechanism is inferential efficiency: defining a persona as Openness=0.8, Conscientiousness=0.6, Extraversion=0.3, Agreeableness=0.7, Neuroticism=0.4 allows the model to autonomously infer correlated micro-behaviors (e.g., high Openness implies curiosity about novel experiences; low Extraversion implies preference for small groups) without each being explicitly specified.

The same principle applies to narrower constructs. Feng et al. (2026) take this further by showing that personality traits exist as measurable patterns in the model's internal activations—the numerical states of its neurons when processing text. The PERSONA framework works in three stages. First, it identifies which activation patterns correspond to each Big Five trait by comparing how the model behaves when prompted with "high" vs. "low" versions of a trait. Second, it demonstrates that strengthening or weakening a trait is a simple matter of scaling this pattern up or down, with near-perfect control (the correlation between intended and measured trait strength was 0.997 out of 1.0). Third, it shows that different traits can be mixed by combining their patterns. This confirms that personality isn't just a surface-level prompt effect; it's a measurable, manipulable property of the model's internal computation.

### 3.3 Persona Anchors

A recurring finding is that lengthy persona specifications at the start of a prompt lose their grip over extended interactions due to the "lost in the middle" phenomenon: tokens in the middle of long contexts receive lower attention weight. The solution, demonstrated by Atri et al. (2026) in their SyTTA framework, is the use of **persona anchors**, short (4–16 token) character descriptors injected immediately before each generation turn. An anchor like "As a skeptical, veteran journalist:" forcefully resets the semantic framing at the point of generation, which overrides accumulated dialogue entropy.

The empirical effect is substantial. SyTTA reports that persona anchors reduce model uncertainty by 12–18% in multi-turn settings compared to relying on a single system prompt at the start of context. The mechanism mirrors the principle of "primacy" in cognitive psychology: the last thing the model processes before generating has outsized influence on the output distribution. Placing a dense identity signal at this position is more efficient than distributing the same information across a longer system prompt.

## **4\. The Transcript-to-Persona Pipeline**

For the application at the center of this review (generating personas from interview transcripts), Section 2's backstory construction is only half the pipeline. The other half is extraction: converting raw, unstructured qualitative data (interview transcripts, diary entries, field notes) into the structured representations that prompt engineering can work with. This pipeline is where fidelity is most easily lost, and where the literature reveals the sharpest gaps between aspiration and practice.

### 4.1 The Zero-Shot Extraction Failure

The most direct approach (feed a raw transcript to an LLM and ask it to produce a persona summary) fails systematically. Zhu et al. (2025) provide the definitive benchmark. Using 518 semi-structured clinical interview transcripts paired with validated Big Five (BFI-10) scores, they evaluated zero-shot and chain-of-thought (CoT) extraction with GPT-4.1 Mini. Pearson correlations between model-predicted trait scores and ground-truth human assessments were uniformly low: r\<0.26 across all five traits. Extraversion was the worst-predicted trait (r≈0.10); Openness the best (r≈0.25).

The failure is not simply a matter of model capability. Zhu et al. (2025) show that even LoRA fine-tuned RoBERTa and LLaMA models plateau at r≈0.35–0.40, and embedding-based regression (using text-embedding-3-small) achieves only r≈0.30. The bottleneck is structural: LLMs cannot reliably differentiate between transient affective states (e.g., a subject acting defensively about a specific topic) and stable personality traits. When a subject expresses anger in one segment of an interview, the model overweights this signal relative to the overall pattern across the full transcript. The same transcript, chunked differently, produces different trait estimates.

This finding has direct implications for the design of extraction pipelines: zero-shot extraction from raw transcripts should be avoided. The signal-to-noise ratio is too low, and the model's tendency to overweight salient but unrepresentative segments introduces unacceptable variance.

### 4.2 RAG-Based Preservation

An alternative to extraction-and-summarization is to skip the condensation step entirely and use the raw transcript as a retrievable corpus. The persona agent queries the transcript database for segments semantically similar to the current conversational context and injects those raw segments into the prompt as behavioral anchors. This approach, documented in Moon (2025, Chapter 3 methodology appendix) and elaborated by Tan et al. (2025), preserves the idiosyncratic linguistic patterns—colloquialisms, pacing, hesitations, specific phraseology—that are inevitably lost during LLM summarization.

The trade-off is between behavioral naturalness and computational overhead. RAG-based preservation produces more natural-sounding personas (the raw transcript segments carry the source's actual voice) but introduces latency from embedding generation and retrieval. Standard chunking strategies (300–500 token fixed windows) work poorly for persona RAG because they sever the causal and emotional arcs of a conversation; Tan et al. (2025) propose using temporal knowledge graphs that preserve the relational context of each segment.

## **5\. Grounding Methods at Inference Time**

Backstories and structured prompts provide the persona's identity; grounding methods ensure that identity is consistently applied during interaction. Two families of techniques dominate the literature: in-context learning via few-shot demonstrations, and retrieval-augmented generation for factual anchoring.

### 5.1 Few-Shot Persona Demonstration

Providing examples of how the persona should behave is one of the most direct inference-time levers. But the number and format of examples matter in non-obvious ways.

**Saturation and degradation.** A study (Anonymous, 2026, arXiv:2602.04294) found that increasing demonstrations from 3 to 10 resulted in a kind of “attention competition”: too many examples cause the model to over-index on mimicking syntax (copying sentence structure, length, and lexical choices) and lose out on cognitive flexibility (the ability to “think” like the persona). In short: persona sounds right but thinks wrong.

**Format effects.** The format of demonstrations matters. Pure Question-Answer pairs produce rigid personas that fail when conversation veers out-of-domain. Behavioral vignettes—short narrative scenarios showing the persona in action with internal monologue—produce more resilient behavior. Formats that expose the persona's reasoning process (e.g., \<internal\_thought\>The user is being aggressive, but my core value is patience.\</internal\_thought\>\<response\>I understand you feel strongly about this.\</response\>) teach the model *how* the persona thinks, not just what it says.

**Dynamic selection.** Rather than using the same few-shot examples for every interaction, recent work retrieves demonstrations based on semantic similarity to the current query. This "within-user RAG" approach (discussed in the comparative evaluation of ReLay, Anonymous, 2025\) outperforms fixed shot sets by ensuring contextual relevance.

### 5.2 Retrieval-Augmented Generation for Persona Grounding

RAG for persona simulation differs from standard RAG for factual question-answering in a critical way: the retrieved material must constrain not just *what* the persona says but *how* it says it. This places different demands on the retrieval system.

**Document-level retrieval mismatch.** Hou et al. (2024) identify a failure mode they call Document-Level Retrieval Mismatch (DRM). When a standard RAG system retrieves a chunk that is factually relevant but emotionally or stylistically mismatched (for example, retrieving a businesslike factual statement about the persona's job when the conversational context calls for frustration about work stress), the LLM produces a jarring shift in tone that breaks the persona illusion. DRM is the primary reason that naive RAG often underperforms pure prompting for persona tasks: the retrieval noise introduces behavioral inconsistency even as it improves factual accuracy.

**Identity-RAG.** Tan et al. (2025) propose ID-RAG, which replaces flat chunk retrieval with retrieval over structured identity graphs. Rather than indexing raw text paragraphs, ID-RAG indexes a knowledge graph of the persona's beliefs, traits, relationships, and historical decisions. When the persona needs to respond, the system retrieves the relevant subgraph—not just the relevant fact—so the generator LLM can understand the context of each piece of knowledge. This reduces DRM incidence by \~35% in long-horizon interactions.

**Comparison with full-context prompting.** The trade-offs between RAG and full-context prompting are becoming clearer. Full-context prompting (inserting the entire backstory into the system prompt) produces more stylistically cohesive dialogue but suffers from hallucination and drift over long horizons. Text-RAG improves factual consistency but introduces DRM-related stylistic breaks. Knowledge-graph RAG achieves near-zero factual hallucination but degrades stylistic fluency because the LLM must reconstruct narrative voice from structured data. The emerging consensus is that a *hybrid* approach (full-context narrative backstory for stylistic fidelity combined with targeted ID-RAG for factual anchoring) represents the current state of the art (Moon, 2025; Tan et al., 2025).

## **6\. Maintaining Multi-Turn Consistency Without Memory Architectures**

Fine-tuned memory systems (like the memory streams in Generative Agents (Park et al., 2023\) or Mem0-style retrieval) are excluded by the inference-time constraint of this review. Maintaining consistency over multiple turns must be achieved through prompt manipulation alone. The literature identifies two mechanisms: combating temporal scope drift and enforcing implicit state tracking.

### 6.1 Temporal Scope Drift

Atri et al. (2026) provide the most rigorous characterization of this problem with the ChronoScope benchmark. Across eight state-of-the-art models, they find that even when persona-defining context is perfectly established early in a conversation, models inexorably drift toward their default-assistant behavior as the conversation lengthens. This drift is not simply a context window limitation; it occurs even when the context window is artificially extended to retain all prior turns. The mechanism is attention decay: tokens at the beginning of the context receive progressively less attention weight as new tokens are added, and the model's default behavior (helpful, neutral, generic) reasserts itself.

The effect is measurable. ChronoScope records a 30–40% reduction in persona-consistent responses between turn 1 and turn 20 across all tested models, with the sharpest decline between turns 5 and 10\. Importantly, this decay is not uniform across personality dimensions: highly salient traits (e.g., political affiliation, professional identity) decay more slowly than subtle traits (e.g., communication style, humor preference).

### 6.2 Persona Anchors and Periodic Re-Grounding

The most effective countermeasure is the persona anchor technique described in Section 3.3, extended to multi-turn settings. Rather than relying on a single system prompt, an inference-time pipeline forcibly injects a persona anchor before every model generation. The SyTTA framework (Anonymous, 2026, ICLR submission) demonstrates that 4–16 token anchors reduce persona drift by 40–60% across 20-turn conversations and maintain near-turn-1 fidelity through turn 20\.

A complementary technique is periodic re-grounding: at fixed intervals (every 3–5 turns), the model is prompted to generate a summary of its persona's current state (beliefs, attitudes, goals) before responding to the user. This forces the attention mechanism to re-access the persona definition rather than coasting on the most recent conversational context. Atri et al. (2026b) formalize this as the PICon (Persona Agent Consistency) interrogation framework, which uses structured probes to detect and correct drift.

## **7\. Evaluating Inference-Time Persona Fidelity**

Measuring how well a persona matches its target requires methods that go beyond surface-level plausibility. The literature has converged on a set of evaluation paradigms that probe different dimensions of fidelity.

### 7.1 Psychometric Interviewing

The dominant paradigm for persona evaluation is the psychometric interview, pioneered by Wang et al. (2024a) in the InCharacter framework. The key innovation is methodological: rather than asking the persona to complete a self-report personality inventory (which suffers from an alignment conflict, in that the model's instruction-following training overrides the persona's supposed traits), InCharacter conducts an open-ended conversational interview and has a separate "expert" LLM evaluate the transcript for trait evidence.

The numbers are striking. Self-report methods on the Big Five Inventory achieved at best 67.1% dimensional accuracy (Acc Dim) and 9.4% full-scale accuracy (Acc Full) using GPT-4 (Wang et al., 2024a, Table 2). InCharacter's interview-based method with expert rating (ER) achieved 76.6% Acc Dim and 30.2% Acc Full on the same scale. Across all 14 tested psychological scales, interview-based evaluation consistently outperformed self-report by 10–25 percentage points.

The practical implication for persona builders is clear: self-report personality assessments administered to LLMs are unreliable. If you need to know whether a persona is actually matching its target, you need to interview it and have an expert judge the conversation (in other words, the same protocol used to evaluate human subjects in clinical psychology).

### 7.2 Behavioral and Consistency Metrics

Psychometric alignment measures whether the persona *is* the target; behavioral metrics measure whether it *acts* like the target. Two frameworks stand out.

**PICon** (Atri et al., 2026b) evaluates across three dimensions: (1) *internal consistency* (does the persona contradict itself within a single session?); (2) *external consistency* (do its factual claims align with the established backstory?); (3) *retest consistency* (does it respond similarly to repeated identical prompts across different sessions?) This tripartite structure captures different failure modes: internal inconsistency suggests attention dilution; external inconsistency suggests insufficient grounding; retest inconsistency suggests that the persona definition is not constraining the model's output distribution.

**Out-of-character spotting.** Shin et al. (2025) propose evaluating at the atomic (sentence) level rather than the session level. Their framework identifies micro-deviations—a single clause where the persona uses an anachronistic word, displays uncharacteristic empathy, or breaks frame—that traditional holistic scoring misses. The assumption is that persona fidelity is not binary; it degrades incrementally, and catching micro-deviations provides more actionable feedback for prompt engineering.

### 7.3 The 80% Ceiling

A pattern across multiple evaluation studies is that even the best inference-time methods plateau at approximately 80% alignment with human or character labels. Wang et al. (2024a) report 80.7% as their highest achieved alignment. Shin et al. (2025) report similar ceilings. This appears to be a structural limitation of inference-time methods: the model's pre-training distribution is always exerting a residual pull toward generic behavior, and no amount of prompt engineering fully suppresses this pull. Whether this ceiling can be breached with better architectures, or whether it represents a fundamental bound on inference-time methods, is an open question.

## **8\. Theoretical Frameworks**

Understanding *why* certain inference-time techniques work (and where they reach their limits) requires a theoretical model of how LLMs represent and simulate personas. Two complementary frameworks have emerged.

### 8.1 The Persona Selection Model

Marks, Lindsey, and Olah (2026) articulate what they call the Persona Selection Model (PSM) in a detailed analysis published on Anthropic's Alignment Science Blog. PSM posits that during pretraining, LLMs learn to simulate a vast repertoire of personas—real humans, fictional characters, AI systems—drawn from the distribution of their training data. This "mixture of voices" (Andreas, 2022\) is the raw material. Post-training (RLHF, DPO) does not create a new persona from scratch; it selects and refines one particular character—the helpful, harmless "Assistant"—and suppresses the others.

### 8.2 Activation Vector Algebra

If PSM explains *that* personas exist as latent structures, Feng et al. (2026) show *where* they live and *how to navigate* to them. The PERSONA framework demonstrates that personality traits (at least Big Five dimensions) exist as independent, measurable patterns in the internal states of LLaMA-family models. The key empirical finding is that these patterns behave like directions on a map: strengthening a trait means moving further in that direction, weakening it means moving the opposite way, and combining traits means moving in both directions at once. Adding the "outgoing" pattern increases measured Extraversion with near-perfect precision (the correlation between intended and measured strength was 0.983 out of 1.0); adding both "outgoing" and "compassionate" simultaneously produces the expected combination.

The theoretical significance is twofold. First, it provides empirical confirmation that the PSM's “mixture of voices” exist as physically measurable patterns inside the model. Second, it suggests a potential path beyond the 80% ceiling: if personality dimensions are independent dimensions, then precisely targeting multiple traits at once may achieve finer-grained control than natural language prompting.

## **9\. Applications of the Literature**

As this literature review was created to inform the development of my startup, Kynd, several promising techniques emerge from the literature to be most actionable and impactful for the product:

**Synthetic Persona Generation via Backstories**: Instead of simply using RSS-adjacent methods for persona generation, Kynd’s internal system will generate detailed narrative backstories (grounded in interview data) for better persona alignment, and supplement that with matching psychographic markers. This backstory will be chunked, and served dynamically via RAG (see “Factual Grounding via ID-RAG”).

**Compartmentalized Persona Prompts**: Kynd will draw on the taxonomy/research from Wang et al. (2024b) in the formulation of its persona prompts. It will include––separated by delimiters––demographics, psychographics, knowledge domain boundaries, and behavioral guardrails, in that order.

**Enhance Agentic Loop with Persona Anchors**: Instead of the generic agentic loop’s system prompt, Kynd will customize the system prompt (or use a hook, depending on the library used) to inject persona anchors on every agent turn to maintain fidelity through multi-step tasks (which will be especially common as the browser using agent is built out). These anchors would be very short (4-16 tokens): “As a passionate first-time founder:”, “As a jaded, veteran journalist:”, “As a curious Informatics student:”, etc.

**Factual Grounding via ID-RAG**: Rather than embedding the full backstory directly into every prompt (which would be expensive and prone to drift), Kynd will implement a two-tier architecture. The complete narrative backstory is broken down into chunks, and stored in a vector database alongside transcript excerpts. Each chunk will have metadata tags for topic, emotional tone, related chunks, and relationship type (may convert to a graph if time permits). At runtime, the system retrieves the top 3 most relevant chunks and injects them into the prompt together with a condensed persona backstory, the aforementioned persona “compartments,” and the persona anchor. This approach preserves the persona's factual coherence without the token cost or attention dilution of passing the entire biography through every turn.

**Developing an Evaluation Method**: Kynd's evaluation pipeline will draw on three frameworks from the literature. First (and most important), an InCharacter-style interview: the persona agent responds to a set of open-ended conversational prompts mapped to psychometric items, and a separate "expert" LLM scores the transcript for trait alignment. Second, a PICon-style multi-turn interrogation: across 10-20 step Playwright sessions, the agent is measured on internal consistency (does it contradict itself?), external consistency (do its factual claims align with its backstory?), and retest consistency (does it respond similarly to the same prompt across sessions?). Third (this may not make it into the MVP, but could be valuable for future iterations), atomic-level Out-of-Character spotting at the sentence level to catch micro-deviations (e.g. an outdated word or momentary break in frame).

The central question for Kynd's MVP is the following: can these inference-time techniques, composed together, deliver trustworthy enough personas that founders believe them, and make better product decisions from them?

##  **References**

Andreas, J. (2022). Language models as agent models. *Proceedings of the 2022 Conference on Empirical Methods in Natural Language Processing*, 5738–5748.

Anonymous. (2026). You only need 4 extra tokens: Synergistic test-time adaptation for LLMs. *ICLR 2026 Submission*.

Anonymous. (2026). Study on role-playing vs. theory of mind divergence. *arXiv:2602.04294*.

Atri, Y. K., Johnson, S. L., & Hartvigsen, T. (2026). Evaluating temporal consistency in multi-turn language models. *arXiv preprint arXiv:2604.23051*.

Atri, Y. K., et al. (2026). PICon: A multi-turn interrogation framework for evaluating persona agent consistency. *arXiv preprint arXiv:2603.25620*.

Bender, E. M., Gebru, T., McMillan-Major, A., & Shmitchell, S. (2021). On the dangers of stochastic parrots: Can language models be too big? *Proceedings of the 2021 ACM Conference on Fairness, Accountability, and Transparency*, 610–623. [https://doi.org/10.1145/3442188.3445922](https://doi.org/10.1145/3442188.3445922)

Feng, X., Zhao, L., Zhong, W., Huang, Y., Gu, Y., Kong, L., Feng, X., & Qin, B. (2026). PERSONA: Dynamic and compositional inference-time personality control via activation vector algebra. *Proceedings of ICLR 2026*.

Hou, et al. (2024). Document-level retrieval mismatch in RAG systems. *arXiv preprint*.

Joshi, B., Ren, X., Swayamdipta, S., Koncel-Kedziorski, R., & Paek, T. (2025). Improving LLM personas via rationalization with psychological scaffolds. *arXiv preprint arXiv:2504.17993*.

Marks, S., Lindsey, J., & Olah, C. (2026). The persona selection model: Why AI assistants might behave like humans. *Anthropic Alignment Science Blog*.

Moon, S. (2025). Binding large language models to virtual personas for human simulation. *UC Berkeley Technical Report EECS-2025-191*.

Moon, S., Abdulhai, M., Kang, M., Suh, J., Soedarmadji, W., Behar, E. K., Chan, D. M., & Canny, J. (2024). Virtual personas for language models via an anthology of backstories. *Proceedings of EMNLP 2024*.

Park, J. S., O'Brien, J. C., Cai, C. J., Morris, M. R., Liang, P., & Bernstein, M. S. (2023). Generative agents: Interactive simulacra of human behavior. *Proceedings of UIST 2023*.

Rajaraman, V. (2023). From ELIZA to ChatGPT. *Resonance*, 28(6), 889–905.

Rafailov, R., Sharma, A., Mitchell, E., Ermon, S., Manning, C. D., & Finn, C. (2023). Direct preference optimization: Your language model is secretly a reward model. *Advances in Neural Information Processing Systems*.

Shao, Y., Li, L., Dai, J., & Qiu, X. (2023). Character-LLM: A trainable agent for role-playing. *Proceedings of EMNLP 2023*.

Shin, J., Oh, J., Kim, E., Song, H., & Oh, A. (2025). Spotting out-of-character behavior: Atomic-level evaluation of persona fidelity in open-ended generation. *Findings of ACL 2025*.

Sun, S., Lee, E., Nan, D., Zhao, X., Lee, W., Jansen, B. J., & Kim, J. H. (2024). Random silicon sampling: Simulating human sub-population opinion using a large language model based on group-level demographic information. *arXiv preprint arXiv:2402.18144*.

Tan, et al. (2025). ID-RAG: Identity retrieval-augmented generation for long-horizon persona coherence in generative agents. *arXiv preprint arXiv:2509.25299*.

Wan, Y., & Chang, K. W. (2025). InsideOut: Measuring and mitigating insider–outsider bias in interview script generation. *arXiv preprint arXiv:2509.21080*.

Wang, X., Xiao, Y., Huang, J., Yuan, S., Xu, R., Guo, H., Tu, Q., Fei, Y., Leng, Z., Wang, W., Chen, J., Li, C., & Xiao, Y. (2024a). InCharacter: Evaluating personality fidelity in role-playing agents through psychological interviews. *Proceedings of ACL 2024*.

Wang, X., et al. (2024b). From persona to personalization: A survey on role-playing language agents. *Transactions on Machine Learning Research*.

Zhu, J., Maharjan, J., Li, X., Coifman, K. G., & Jin, R. (2025). Evaluating LLM alignment on personality inference from real-world interview data. *arXiv preprint arXiv:2509.13244*.

