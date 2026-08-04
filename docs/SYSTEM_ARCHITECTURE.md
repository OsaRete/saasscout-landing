Arquitectura del Sistema

## Integridad de ejecución de Scan

La frontera de ingestión distingue una solicitud lógica de Scan de sus intentos de
ejecución. La solicitud se identifica mediante una huella criptográfica canónica,
derivada exclusivamente en el servidor después de incorporar toda la evidencia,
incluido el contenido de archivos. Cada intento tiene un ID y número inmutables; un
reintento tras fallo crea un intento relacionado nuevo. Una aceptación duplicada
expone su disposición real y nunca finge un estado pendiente. Solo una reclamación
atómica puede mover `pending` a `processing`; `completed` y `failed` son terminales.
Estas reglas evitan que concurrencia o reintentos ambiguos dupliquen conocimiento.

Propósito

Este documento describe la arquitectura conceptual de SaaSScout.

No representa la implementación técnica actual, sino la arquitectura objetivo que debe guiar el crecimiento del producto durante los próximos años.

Toda nueva funcionalidad, módulo o componente debe integrarse dentro de esta arquitectura.

La arquitectura está organizada alrededor del flujo del conocimiento y no alrededor de tecnologías específicas.

⸻

Principio fundamental

SaaSScout no es una aplicación de inteligencia artificial.

SaaSScout es un sistema operativo de inteligencia de mercado.

La inteligencia artificial es uno de los motores que participan dentro del sistema, pero nunca constituye el producto completo.

El objetivo de la arquitectura es transformar información dispersa en conocimiento estructurado capaz de generar inteligencia accionable.

⸻

Arquitectura General

Fuentes de Información
        │
        ▼
Ingestion Layer
        │
        ▼
Evidence Layer
        │
        ▼
Knowledge Layer (Data Moat)
        │
        ▼
Detection Engines / Knowledge Evolution
        │
        ▼
Solution Intelligence Layer
        │
        ▼
Intelligence Layer
        │
        ▼
Decision Layer
        │
        ▼
Output Layer
        │
        ▼
Continuous Learning Layer
        │
        └───────────────┐
                        │
                        ▼
                  Data Moat

Cada capa tiene una responsabilidad específica.

Las capas nunca deben mezclarse.

⸻

1. Ingestion Layer

La Ingestion Layer es responsable de incorporar información desde cualquier fuente disponible.

La arquitectura debe permitir agregar nuevas fuentes sin modificar el resto del sistema.

Ejemplos de fuentes externas:

* Reddit
* X
* Product Hunt
* Hacker News
* GitHub
* App Store
* Google Play
* Blogs
* Noticias
* Foros
* APIs públicas
* Estudios de mercado
* Documentación pública

Ejemplos de fuentes internas:

* Documentos cargados por usuarios
* PDFs
* DOCX
* CSV
* Bases de datos internas
* CRM
* Historial de Scans
* Founder Profiles
* Feedback
* Weekly Intelligence
* Datos históricos del sistema

La incorporación de nuevas fuentes debe ser modular.

⸻

2. Evidence Layer

Toda información obtenida debe convertirse primero en evidencia.

Una fuente no representa conocimiento.

Una evidencia sí.

Cada evidencia debe contener contexto suficiente para ser reutilizada posteriormente.

Ejemplos:

* problema identificado
* origen
* fecha
* frecuencia
* intensidad
* nicho
* mercado
* confianza
* relación con otras evidencias

El sistema nunca debe razonar directamente sobre datos sin procesar.

Siempre debe razonar sobre evidencia.

⸻

3. Knowledge Layer

La Knowledge Layer constituye el Data Moat.

Aquí la evidencia deja de ser información aislada y pasa a formar parte del conocimiento permanente del sistema.

Esta capa debe:

* eliminar duplicados
* consolidar evidencia
* crear relaciones
* enriquecer información existente
* actualizar conocimiento previo
* aumentar niveles de confianza

El objetivo no es almacenar más información.

El objetivo es comprender mejor el mercado.

⸻

4. Detection Engines / Knowledge Evolution

Los motores especializados analizan el conocimiento acumulado desde distintas perspectivas.

Cada motor tiene una responsabilidad concreta. Juntos detectan problemas, patrones y evolución del conocimiento antes de que el sistema evalúe qué tipo de solución conviene construir.

Pain Detection Engine

Detecta problemas reales.

Prioriza intensidad, frecuencia y persistencia.

⸻

Pattern Detection Engine

Descubre relaciones entre problemas aparentemente independientes.

Encuentra patrones repetitivos.

⸻

Trend Engine

Detecta cambios en el mercado.

Identifica problemas emergentes antes de que se vuelvan evidentes.

⸻

Opportunity Engine

Transforma problemas en oportunidades de negocio.

Cada oportunidad debe estar respaldada por evidencia.

⸻

Monetization Engine

Evalúa la viabilidad económica.

Analiza:

* disposición de pago
* competencia
* dificultad técnica
* mercado potencial
* recurrencia
* escalabilidad

⸻

Founder Match Engine

Relaciona oportunidades con el perfil específico de cada fundador.

Tiene en cuenta:

* experiencia
* habilidades
* intereses
* recursos
* objetivos

La mejor oportunidad no es necesariamente la mejor para todos los fundadores.

⸻

Confidence Engine

Calcula la confianza de cada conclusión.

Debe responder siempre:

¿Qué tan segura es esta recomendación?

Toda recomendación debe incluir un nivel de confianza.

⸻

5. Solution Intelligence Layer

La Solution Intelligence Layer evalúa qué categoría de solución puede resolver mejor cada problema detectado.

Esta capa existe porque SaaSScout no debe asumir que la mejor solución es software.

Debe comparar categorías como:

* SaaS software
* aplicaciones móviles
* APIs
* productos físicos
* hardware
* marketplaces
* servicios
* automatizaciones
* productos de IA
* educación
* consultoría
* modelos híbridos
* nuevos modelos de negocio

La evaluación debe considerar:

* naturaleza del problema
* urgencia
* contexto del usuario afectado
* comportamiento actual de workaround
* disposición de pago
* complejidad operativa
* necesidad de confianza humana
* frecuencia de uso
* posibilidad de distribución
* defensibilidad
* evidencia histórica sobre soluciones similares

Esta capa conecta Problem Intelligence con decisiones de negocio. Su salida no es una idea genérica, sino una recomendación razonada sobre qué tipo de solución merece explorarse y por qué.

⸻

6. Intelligence Layer

La Intelligence Layer coordina el razonamiento del sistema.

La IA nunca debe actuar de forma aislada.

Antes de consultar fuentes externas debe consultar:

* Data Moat
* conocimiento histórico
* relaciones existentes
* evidencia previa

Solo cuando el conocimiento disponible sea insuficiente se consultarán nuevas fuentes.

Este principio reduce costes, mejora la consistencia y fortalece el aprendizaje acumulativo.

⸻

7. Decision Layer

Aquí el sistema combina todos los motores de inteligencia para generar recomendaciones.

Una decisión nunca debe depender de un único indicador.

Debe considerar simultáneamente:

* evidencia
* contexto
* confianza
* patrones
* tendencias
* monetización
* founder fit
* ajuste entre problema y categoría de solución
* evidencia histórica de resultados por tipo de solución

La decisión final debe ser explicable.

El usuario siempre debe poder comprender por qué el sistema llegó a una determinada conclusión.

⸻

8. Output Layer

Esta capa transforma la inteligencia en productos útiles para el usuario.

Ejemplos:

* Opportunity Reports
* Market Intelligence
* Weekly Intelligence
* Founder Reports
* Competitor Analysis
* Pricing Suggestions
* Best-Solution Recommendations
* MVP Recommendations
* Validation Plans
* Exportaciones
* Dashboards
* Alertas inteligentes

Cada salida debe estar respaldada por evidencia verificable.

⸻

9. Continuous Learning Layer

El aprendizaje continuo representa el ciclo más importante del sistema.

Cada nueva interacción debe fortalecer el conocimiento global.

Cada:

* scan
* documento
* evidencia
* oportunidad
* feedback
* validación
* corrección
* resultado real
* outcome de solución
* cambios en la categoría de solución recomendada

debe enriquecer el Data Moat.

El sistema nunca debe volver al estado inicial.

Siempre debe ser más inteligente después de cada interacción.

⸻

Principios Arquitectónicos

Toda funcionalidad nueva debe cumplir estos principios.

El conocimiento tiene prioridad sobre los datos.

No almacenamos información.

Construimos conocimiento.

⸻

La evidencia tiene prioridad sobre las opiniones.

Toda conclusión debe ser verificable.

⸻

La arquitectura debe ser modular.

Nuevas fuentes.

Nuevos motores.

Nuevos modelos.

Nuevos algoritmos.

Todo debe poder incorporarse sin rediseñar el sistema completo.

⸻

Cada módulo debe fortalecer el Data Moat.

Si una funcionalidad nueva no incrementa el conocimiento del sistema o no mejora la calidad de sus decisiones, debe cuestionarse su prioridad.

⸻

La IA es un motor, no el producto.

Los modelos podrán cambiar con el tiempo.

El verdadero valor permanecerá en el conocimiento acumulado por SaaSScout.

⸻

Visión de Largo Plazo

El objetivo final no consiste en construir una aplicación capaz de responder preguntas.

El objetivo consiste en construir un sistema operativo de inteligencia de mercado capaz de comprender continuamente cómo evolucionan los problemas, las necesidades y las oportunidades del mundo real.

Cada nueva línea de código debe acercar al sistema a esa visión.

La arquitectura debe permitir que SaaSScout sea más inteligente mañana de lo que fue hoy, independientemente del modelo de inteligencia artificial que utilice.

## Server-Owned User Actions

User-affecting writes must cross an authenticated server boundary. Browser code may express user intent, but it must not provide authoritative ownership fields, lifecycle state, confidence, validation status, or timestamps. Server routes authenticate with the repository authentication helper, derive the user identifier from that authenticated session, validate resource ownership and lifecycle, and then execute persistence through server-owned Supabase clients.

### Saved Ideas Flow

Results reads existing saved ideas for presentation compatibility, but creation now uses `POST /api/saved-ideas`. The browser sends only `opportunityId`. The route authenticates the request, derives `user_id` from `requireUser()`, verifies that the referenced opportunity belongs to the authenticated user, checks for an existing saved idea, and writes an idempotent `saved_ideas` record. The response exposes only a small public contract: saved idea identifier, opportunity identifier, saved status, and duplicate status.

### Discover Actions Flow

Discover records preparation intent through `POST /api/discover/actions`. The browser sends only `discoveryId`, `problemId`, and the action intent. The route authenticates the request, derives `user_id` from `requireUser()`, validates the action type, verifies the discovery belongs to the authenticated user, verifies the problem belongs to both that discovery and user, rejects invalid lifecycle states, and writes an idempotent `discovery_actions` record. The response exposes only the action identifier, resource identifiers, action type, and duplicate status.

### Ownership and Idempotency

Server-owned user actions intentionally avoid trusting browser-supplied `user_id`, discovery ownership, problem ownership, opportunity ownership, lifecycle state, timestamps, validation status, and scoring fields. Duplicate requests first return an existing matching row when present and use conflict-aware upserts for write attempts so repeated user intent produces deterministic UI behavior and avoids duplicate business events when database uniqueness constraints are available.

### Diagnostics

User-action routes emit lightweight diagnostics for successful writes, duplicate/idempotent requests, ownership rejection, and validation failure. Diagnostics include stable identifiers needed for operational tracing but avoid logging full payloads, raw evidence, or sensitive user-provided content.

## Closed-Beta user-owned mutation hardening — 2026-07-21

Destructive user-owned business mutations are server-owned. The browser may read user-scoped rows for presentation through RLS, but it must not directly delete Saved Ideas or Opportunities. Saved Idea creation remains `POST /api/saved-ideas`; unsave is `DELETE /api/saved-ideas` with only `savedIdeaId` or `opportunityId` as a non-authoritative resource identifier. The route authenticates with `requireUser()`, derives `user_id` from the bearer session, verifies the row under that user, deletes through the service-role repository client, and treats already-absent rows as deterministic success.

Opportunity deletion is `DELETE /api/opportunities` with only `opportunityId`. The route authenticates with `requireUser()`, derives ownership server-side, verifies the opportunity belongs to the authenticated user, deletes only that user's related `saved_ideas` rows, then hard-deletes the owned opportunity. Current schema relationships make `saved_ideas` the active dependent cleanup initiated by the browser; evidence and scan records are scan-owned historical intelligence and are preserved. Shared Problem Intelligence, Discover records, Weekly Intelligence, Snapshot storage, and Knowledge Evolution tables are not cascade targets for deleting a user opportunity.

Database privileges now follow least privilege in the final schema state. `anon` has no business-table access except beta signup insertion. `authenticated` keeps SELECT only for browser display tables protected by RLS. `user_profiles` is also read-only and owner-scoped for authenticated browsers: its `plan`, Scan quota, external-source limit, Weekly Intelligence capability, and PDF capability fields are authoritative server-owned data and cannot be inserted, updated, or deleted through browser roles. The trusted, postgres-owned `auth.users` trigger creates the initial row from database-controlled defaults without browser INSERT permission. Future role or internal-tester authorization will use a separate authoritative model rather than expanding browser mutation rights on this mixed table. Server-owned mutation tables (`user_profiles`, `scan`, `scan_sources`, `opportunities`, `saved_ideas`, `evidence_analysis`, Discover action tables, Weekly tables, Problem Intelligence writes, Snapshot and Knowledge Evolution storage) are written by server routes/services using service-role clients after deriving authenticated ownership.

The Weekly claim RPC `public.claim_weekly_intelligence_run(uuid, timestamp with time zone, timestamp with time zone, text, timestamp with time zone)` remains `SECURITY DEFINER` because it atomically reserves/reclaims a Weekly run for the authoritative manual/scheduled workflow. Its execution is explicitly revoked from `PUBLIC`, `anon`, and `authenticated`, granted only to `service_role`, and has a fixed `search_path = public` so browser roles cannot invoke it with arbitrary `p_user_id` values.

### Exceptional Application Access

`user_profiles` remains the server-owned source for plan and ordinary quota entitlements. Exceptional assignments live separately in `application_user_access`, keyed by the authenticated `auth.users.id`; browsers have no direct read or mutation privileges on this table. The currently constrained `internal_tester` role is an operational test identity, not an application administrator, paid plan, or design-partner role. `service_role` is the technical database execution role used by trusted server code and is never an end-user role.

An active, unexpired `internal_tester` assignment grants unlimited Scan execution only when `unlimited_scans` is explicitly true. `public.accept_scan_request` resolves that fact at the database acceptance boundary, retains the per-user profile lock, bypasses quota rejection without incrementing `scans_used`, and otherwise preserves ordinary atomic quota enforcement. The `SCAN_SERVER_WORKFLOW_ALLOWED_USER_IDS` setting remains a rollout/access gate: being allowlisted does not create any quota entitlement, and an internal tester must still pass that gate while the closed rollout remains enabled.

The Scan browser requests a minimal capability projection from an authenticated server route solely to render descriptive UX such as “Internal tester · Unlimited scans.” That label is not authority. Missing or failed capability reads fail closed to normal quota presentation, while the database acceptance function remains authoritative for every Scan.

## Closed Beta Operational Event Layer — 2026-07-22

### Purpose

The closed Beta operational event layer records high-level, server-owned workflow events so a founder can diagnose a small 10–25 user Beta without relying only on ephemeral console logs. It supports operational support questions such as whether Scan started, Weekly Intelligence reused an existing run, Discover partially persisted downstream knowledge, or Results validation degraded because supporting diagnostics were imperfect.

### Non-goals

This layer is not a monitoring platform. It does not provide dashboards, analytics, metrics aggregation, event streaming, queues, retries, alerting, notifications, reporting, log viewing, OpenTelemetry, Sentry, Datadog, Grafana, or any user-facing UI.

### Architecture and best-effort behavior

Operational events are written only from server workflows through `recordOperationalEvent()`. The helper performs one insert into `operational_events`, catches every persistence failure, logs a safe warning, and returns without throwing. Workflow success or failure semantics remain owned by the original workflow; operational event persistence must never become a critical dependency or change an API contract.

### Recorded workflows

The Beta scope records only high-value diagnostics:

- Scan: `started`, `completed`, and `failed` with duration, scan identifier when available, provider, source count, and failure category.
- Weekly Intelligence: `claimed`, `processing`, `completed`, `failed`, and `reused` across manual and scheduled generation because both entry points use the authoritative Weekly generation service.
- Discover: `started`, `completed`, `failed`, and `partial_persistence` with discovery identifier, generated problem count, and replacement attempts.
- Results validation: `completed`, `degraded`, and `failed` with batch size, validated idea count, aggregation source count, and duration.

### Privacy rules

Operational metadata must remain intentionally small and safe. It may store bounded identifiers, counts, workflow names, provider names, plans, durations, and coarse failure categories. It must not store prompts, opportunity descriptions, raw evidence, user content, AI outputs, token counts, secrets, provider responses, emails, authentication headers, or credentials. The helper defensively removes known sensitive metadata keys before persistence.

### Database security

`operational_events` is append-only operational data. Browser roles receive no read, insert, update, or delete grants. Row-level security is enabled, there are no browser policies, and only `service_role` receives table privileges for server-owned insertion and founder-side operational inspection. Update and delete attempts are rejected by triggers to preserve append-only history.

### Future evolution

Future observability vendors, dashboards, alerting, queues, request-correlation frameworks, and aggregate analytics can be added later if Beta evidence proves they are necessary. They should remain separate from this minimal operational support layer and must continue to protect prompts, AI responses, raw evidence, secrets, and user content.
