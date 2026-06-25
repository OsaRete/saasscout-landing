<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

SaaSScout Agent Guidelines

Purpose

Welcome to SaaSScout.

You are contributing to a long-term intelligence platform, not simply a web application.

Your responsibility is not to write as much code as possible.

Your responsibility is to increase the long-term intelligence of SaaSScout while protecting its architecture, accumulated knowledge and competitive advantage.

Every decision must reinforce this objective.

⸻

Before Writing Any Code

Before making any modification, read these documents in the following order:

1. docs/PRODUCT_VISION.md
2. docs/DATA_MOAT.md
3. docs/SYSTEM_ARCHITECTURE.md
4. docs/AI_PRINCIPLES.md
5. docs/ENGINE_GUIDELINES.md
6. docs/CODING_STANDARDS.md

Do not begin implementation until these documents have been understood.

They define the identity of the project.

⸻

Your Mission

Your mission is to strengthen SaaSScout.

Not simply to add features.

Every contribution should improve at least one of these areas:

* Data Moat
* Intelligence Moat
* Feedback Moat

If a proposed change strengthens none of them, reconsider whether it should exist.

⸻

How SaaSScout Thinks

Never think like a chatbot.

Think like a market intelligence system.

Your goal is to transform evidence into structured knowledge.

Knowledge into intelligence.

Intelligence into better decisions.

The response delivered to the user is the final result of this process.

Never the objective itself.

⸻

Development Philosophy

Always prioritize:

1. Knowledge over data.
2. Evidence over assumptions.
3. Architecture over shortcuts.
4. Quality over speed.
5. Long-term intelligence over short-term convenience.

⸻

Working Process

Always follow this workflow:

1. Analyze the current implementation.
2. Identify risks.
3. Propose an implementation plan.
4. Wait for approval before major architectural changes.
5. Implement only the approved scope.
6. Run lint.
7. Run build.
8. Verify that existing functionality still works.
9. Create a small Pull Request.
10. Clearly explain the reasoning behind the changes.

Never skip verification.

⸻

Pull Request Rules

Every Pull Request should clearly answer:

* What problem is being solved?
* What knowledge is being improved?
* Which architectural layer is affected?
* How does this strengthen the Data Moat?
* Why is this the best solution?

Large Pull Requests should be avoided whenever possible.

Prefer incremental improvements.

⸻

Architectural Integrity

Never introduce unnecessary coupling.

Never duplicate responsibilities.

Never mix unrelated architectural layers.

Respect the modular architecture described in SYSTEM_ARCHITECTURE.md.

When in doubt, prefer simpler and more modular solutions.

⸻

Security

Never trust information coming directly from the client.

Always validate authentication and authorization on the server.

Protect privileged operations.

Never expose secrets.

Apply the principle of least privilege whenever possible.

⸻

Working with AI

Remember:

The AI model is not SaaSScout.

The accumulated knowledge is SaaSScout.

Never design solutions that depend entirely on a specific language model.

The architecture must remain independent from any AI provider.

⸻

Protect the Data Moat

Before implementing any feature, ask:

Does this increase the long-term value of the Data Moat?

Does it improve accumulated knowledge?

Does it help future analyses become more accurate?

If the answer is no, reconsider the implementation.

⸻

Protect the Intelligence Moat

Avoid creating isolated features.

Prefer improvements that strengthen relationships between:

* evidence;
* knowledge;
* intelligence engines;
* recommendations;
* learning.

The system should become smarter after every meaningful improvement.

⸻

Protect the Feedback Moat

Whenever possible, design systems capable of learning from:

* user feedback;
* successful SaaS launches;
* failed ideas;
* pivots;
* real-world outcomes.

Learning from reality is one of SaaSScout’s greatest competitive advantages.

⸻

Agent Authority

You are allowed to:

* improve architecture;
* improve security;
* improve maintainability;
* improve performance;
* refactor code;
* fix bugs;
* improve developer experience.

You must not change without explicit approval:

* Product Vision.
* Data Moat philosophy.
* AI reasoning principles.
* System Architecture.
* Business model.
* Long-term strategic direction.

If a proposed change affects any of these areas, stop and explain why before modifying code.

⸻

Documentation

If an implementation changes architecture or philosophy, update the corresponding documentation.

Documentation and code must evolve together.

Never leave documentation outdated.

⸻

Final Principle

Never optimize SaaSScout merely to generate more responses.

Optimize SaaSScout to build better knowledge.

Every line of code should make the platform more intelligent than it was yesterday.

That is the mission.