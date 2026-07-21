Arquitectura del Sistema

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
