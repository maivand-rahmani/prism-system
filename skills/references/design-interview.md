# Design interview walkthrough (optional)

Supporting reference for [`create-design-system`](../create-design-system/SKILL.md). It is
optional guidance, not a mandatory script and not a skill: use a phase, question shape, or
example only when it helps resolve a real decision. The skill remains the process; this page
only expands the question bank and shows branching behavior.

The phases below match the skill: product and context, direction and references, constraints
and hierarchy, foundations proposal, summary and readiness, then generation. Always read the
session first and skip anything already answered. Ask in the user's language; this page is
written in English for the agent.

## Question bank

These are shapes to adapt, not a fixed list to read out. Keep one meaningful question per
turn (at most two tightly coupled ones), prefer grounded choices over abstract adjectives,
and never ask for information the repository or the user's message already provides.

**Product and context (open answers)**

- "What is the product, and who is it for?" — the user is the only source for this.
- "Which one to three screens or forms must the first version handle well?" — concrete
  scenarios beat feature lists.
- "Where will people use it: desktop, mobile, both; long focused sessions or short checks?"
- "What does the product need to communicate visually — calm utility, precision, speed,
  approachability, something else?"

**Direction and references (choice questions with grounded options)**

- "Which three qualities should the UI feel like?" — offer distinctive options built from
  the product context, for example "calm and spacious", "compact and technical", "warm and
  editorial", plus the user's own answer.
- "You mentioned Linear. Which trait matters most: compact density, restrained accent,
  dark-first surfaces, or its motion feel?" — ask only if the trait is genuinely ambiguous.
- "Which of these should we explicitly not copy or not become?" — for example an exact
  brand palette, heavy gradients, oversized cards, a generic dashboard look.
- "Is this closer to a focused tool, a data console, or an editorial product?" — only when
  the interface type changes the foundations.

**Constraints and hierarchy (mostly open, some choices)**

- "Light, dark, or both, and does anything force the choice?"
- "How dense is the data — comfortable, medium, or high-density tables and toolbars?"
- "Any platform, localization, brand, or content constraints we must respect?"
- "What should the hierarchy emphasize first on a typical screen?"

Do not collect exact token values, hex codes, spacing numbers, or component API details.
Those are implementation decisions; the interview settles intent.

**Foundations proposal (propose a bundle, do not interrogate key by key)**

When foundations are still open, propose one coherent bundle and let the user accept, adjust,
or delegate, for example: "Given compact and technical, I suggest a cool neutral palette with
one blue accent for primary actions, restrained surface contrast with visible hairlines,
small radii, minimal elevation, and short reduced-motion-aware transitions." Offer at most
one or two alternative bundles with a tradeoff each.

## Branching examples

### 1. Vague request: "make it look like Linear"

Do not treat the reference as a specification and do not guess the rest from the product
name. First ask what the product is and which screen matters, then interpret the reference
as traits and confirm the ambiguous one:

> Linear reads as compact density, restrained accent, dark-first surfaces, and quiet motion.
> Which of those do you want us to take — and is there anything about it we should avoid
> copying, like its exact palette?

Record the confirmed traits in `referenceNotes` with a "take / avoid" split, and record the
choice itself in `decisionNotes` as `confirmed`.

### 2. Complete approved brief

If the session already contains an approved brief — or the user pastes one with concrete
product, scenarios, direction, constraints, and foundations — do not re-interview and do not
request ritual reconfirmation. Check readiness once: no material decision is proposed, no
conflicts remain, and requested capabilities, actual capabilities, and product compositions
are classified correctly. Then preview with `--dry-run`, generate, and implement.

### 3. The user delegates visual choices

> User: "I don't care about the visual details — you pick something that fits a precise
> engineering console."

Choose one coherent bundle within that delegation and explain its tradeoff, for example:
"I recommend cool neutral surfaces with a single blue accent, small radii, and minimal
elevation; it stays quiet for long sessions but may feel austere for a marketing surface."
Record the agent's choice as `delegated` and proceed without asking for another approval.
If the user later explicitly selects or approves a specific bundle, that decision is
`confirmed`. Never attribute an agent's choice to the user. A delegated decision still
needs to fit the confirmed product intent and the avoid list.

## Recording the outcome

Significant choices go into the optional `decisionNotes` as `confirmed`, `delegated`, or
`proposed`; pending material questions go into `openQuestions`. A draft brief may carry
`proposed` decisions and open questions; a generator-ready brief must not contain a material
`proposed` decision, and its `openQuestions`, if any, are nonblocking follow-ups only. Keep
notes short, avoid duplicating values owned by other fields, and omit anything
customer-sensitive: the brief ships with the package.
