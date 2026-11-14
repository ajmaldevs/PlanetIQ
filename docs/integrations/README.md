# TerraLens External Integrations & Tool Architecture

This directory contains the integration policies, registers, and configuration guidelines governing external tools, MCP servers, developer plugins, and NASA scientific data APIs used by TerraLens.

---

## Documents

1. [**Integration Inventory & Register (`integration_inventory.md`)**](file:///C:/Users/ajumu/Downloads/PlanetIQ/docs/integrations/integration_inventory.md):
   Detailed matrix of all installed and configured tools, MCP servers, APIs, required credentials, usage phases, and operational limits.

---

## Core Integration Principles

1. **Intelligent Automation over Manual Duplication**:
   - Utilize existing verified toolchains (Alembic for migrations, MapLibre GL for rendering, Recharts for analytics, Pytest for testing).
   - Leverage official SDKs (e.g., `google-genai` for the AI assistant) rather than unvetted wrappers.

2. **Strict Security & Zero Secrets in Git**:
   - Credentials (NASA Earthdata tokens, Google Gemini API keys, PostGIS database passwords) are stored strictly in environment variables loaded from `.env` (excluded by `.gitignore`).
   - Server-side proxying ensures frontend clients never receive secret keys.

3. **Autonomous Resilience**:
   - The platform never crashes when optional third-party integrations or cloud databases are offline.
   - Built-in graceful fallbacks ensure the backend, frontend maps, and AI assistant function reliably in both offline and production environments.

4. **Scientific Accuracy Enforcement**:
   - All external satellite data feeds are vetted at the ingestion boundary for physical validity, unit consistency (mm/hr vs mm, meters relative to MSS, dimensionless NDVI), and quality flags.
