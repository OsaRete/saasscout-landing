# Snapshot Types

## Purpose

This document defines the conceptual Snapshot Type taxonomy used throughout the SaaSScout Data Moat.

It specifies the canonical intelligence sections that compose a Snapshot and establishes their architectural responsibilities.

This document intentionally does not define:

- TypeScript interfaces
- Database schemas
- API contracts
- Serialization formats

Its purpose is to establish a stable architectural language that future implementations must follow.

---

# Architectural Principle

A Snapshot is not a flat object.

A Snapshot is composed of multiple specialized intelligence sections.

Each section represents one dimension of intelligence produced during a Discovery.

This modular structure allows the Snapshot Contract to evolve without breaking historical compatibility.

---

# Snapshot Composition

Every Snapshot is composed of the following conceptual types:

Snapshot
│
├── Metadata
├── Discovery Context
├── Problem Intelligence
├── Opportunity Intelligence
├── Founder Intelligence
├── Evidence
├── Confidence
├── Diagnostics
├── Versions
└── Provenance

Each type has a single responsibility.

---

# Snapshot Metadata

## Purpose

Metadata identifies the Snapshot.

It answers:

- What is this Snapshot?
- When was it created?
- Which Discovery produced it?

Metadata never contains business intelligence.

Metadata exists only for identification and traceability.

---

Metadata includes concepts such as:

- Snapshot Identifier
- Creation Timestamp
- Discovery Identifier
- Snapshot Version
- Contract Version
- Lifecycle State

Metadata must remain immutable.

---

# Discovery Context

## Purpose

Discovery Context preserves the environment in which the Discovery occurred.

It allows future systems to understand the conditions that generated the intelligence.

Discovery Context is descriptive.

It is never interpreted as knowledge.

---

Examples of contextual information include:

- Search topic
- Search intent
- Discovery mode
- Requested language
- Requested market
- User configuration
- Source providers used
- Discovery execution metadata

Context should explain the Discovery.

It should never duplicate intelligence.

---

# Problem Intelligence

## Purpose

Problem Intelligence represents the market problem discovered during the analysis.

This is the core business problem identified by the Modular Intelligence Engine.

Problem Intelligence is descriptive.

It does not prescribe solutions.

---

Problem Intelligence may include concepts such as:

- Problem Title
- Problem Summary
- Pain Description
- Affected Market
- Affected Audience
- Pain Severity
- Frequency
- Urgency
- Existing Workarounds
- Related Niches

Problem Intelligence describes reality.

It never contains business recommendations.

---

# Opportunity Intelligence

## Purpose

Opportunity Intelligence represents the opportunity identified from the problem.

It describes why the problem represents a business opportunity.

It does not decide which business should be built.

---

Opportunity Intelligence may include concepts such as:

- Opportunity Summary
- Opportunity Score
- Market Size Signals
- Competitive Signals
- Build Simplicity
- Willingness To Pay
- Revenue Potential
- Risk Indicators
- Validation Indicators

Opportunity Intelligence explains opportunity quality.

It does not generate recommendations.

---

# Founder Intelligence

## Purpose

Founder Intelligence evaluates the compatibility between the discovered opportunity and a founder profile.

Founder Intelligence is optional.

Its absence must never invalidate a Snapshot.

---

Examples include:

- Founder Score
- Founder Fit
- Technical Complexity
- Domain Match
- Distribution Match
- Execution Difficulty
- Founder Advantages
- Founder Risks

Founder Intelligence is advisory.

It never changes the opportunity itself.

---

# Evidence

## Purpose

Evidence preserves why the Discovery reached its conclusions.

Evidence must always support intelligence.

Evidence never replaces intelligence.

---

Evidence includes references to:

- external sources
- extracted signals
- supporting observations
- market indicators
- confidence rationale

Evidence should reference information.

It should never duplicate raw provider payloads.

---

# Confidence

## Purpose

Confidence expresses how strongly the system believes the discovered intelligence.

Confidence is not the same as quality.

Confidence is not certainty.

Confidence represents confidence in the available evidence.

---

Confidence may include:

- Overall Confidence
- Evidence Confidence
- Opportunity Confidence
- Founder Confidence
- Market Confidence

Future versions may introduce calibration metadata.

---

# Diagnostics

## Purpose

Diagnostics preserve technical information that explains how the Discovery was produced.

Diagnostics are intended for system analysis.

They are not business intelligence.

---

Diagnostics may include:

- Engine diagnostics
- Quality metrics
- Decision metrics
- Validation metrics
- Warning codes
- Processing statistics
- Scoring diagnostics

Diagnostics should never influence historical intelligence directly.

---

# Versions

## Purpose

Versions preserve compatibility across time.

They allow SaaSScout to evolve without rewriting historical Snapshots.

---

Versions include conceptual references such as:

- Snapshot Contract Version
- Intelligence Version
- Engine Version
- Confidence Version
- Normalization Version

Future processing can use version metadata to interpret historical Snapshots correctly.

---

# Provenance

## Purpose

Provenance guarantees traceability.

Every important conclusion inside the Snapshot must be explainable.

---

Provenance records conceptual relationships such as:

- Source References
- Discovery Origin
- Engine Attribution
- Processing History
- Evidence Lineage

Provenance is mandatory.

Knowledge without provenance must never exist.

---

# Optional Future Types

The following Snapshot sections are intentionally reserved for future versions.

They should not be implemented during Phase 1.

Examples include:

## Validation Intelligence

Tracks real-world validation of opportunities.

---

## Market Evolution

Tracks how markets evolve over time.

---

## Founder Evolution

Tracks changes in founder profile compatibility.

---

## Competitive Evolution

Tracks competitors across historical Snapshots.

---

## Learning Signals

Stores validated feedback for future Learning systems.

---

## Recommendation History

Stores historical recommendation decisions.

---

## Prediction Metadata

Supports future Prediction Engine capabilities.

---

# Relationships Between Types

The conceptual flow inside a Snapshot is:

Discovery Context

↓

Problem Intelligence

↓

Opportunity Intelligence

↓

Founder Intelligence

↓

Evidence

↓

Confidence

↓

Diagnostics

↓

Versions

↓

Provenance

Each section enriches the next.

No section replaces another.

---

# Architectural Rules

The Snapshot taxonomy follows these rules.

## Rule 1

Each conceptual type has exactly one responsibility.

---

## Rule 2

Business intelligence must never be mixed with diagnostics.

---

## Rule 3

Evidence supports intelligence.

It never replaces intelligence.

---

## Rule 4

Confidence evaluates intelligence.

It never creates intelligence.

---

## Rule 5

Diagnostics explain processing.

They never become business knowledge.

---

## Rule 6

Versions guarantee compatibility.

They never alter historical meaning.

---

## Rule 7

Provenance is mandatory for every persisted intelligence artifact.

---

## Rule 8

Future Snapshot sections must extend the taxonomy rather than modify existing meanings.

---

# Compatibility

This taxonomy is designed to support:

- Snapshot Builder
- Snapshot Validator
- Snapshot Persistence
- Knowledge Evolution
- Memory Layer
- Learning Layer
- Recommendation Engine
- Prediction Engine
- Analytics
- Future Intelligence Engines

without requiring structural redesign.

---

# Success Criteria

The Snapshot Type taxonomy is considered successful when:

- every Snapshot follows the same conceptual structure;
- each intelligence section has a single responsibility;
- future extensions can be added without breaking historical Snapshots;
- the taxonomy remains independent of programming languages, databases and AI providers;
- implementations can translate this architecture directly into code without redefining its semantics.

This taxonomy becomes the canonical architectural language for all future Snapshot implementations within the SaaSScout Data Moat.