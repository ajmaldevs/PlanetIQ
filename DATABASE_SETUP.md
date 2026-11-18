# PlanetIQ — PostgreSQL & PostGIS Database Setup, Migration, and Production Runbook

This guide provides comprehensive documentation and executable Windows PowerShell procedures for configuring, operating, and migrating the PlanetIQ PostgreSQL + PostGIS database between local development environments and the Render production cloud.

---

## 1. Architectural Overview

### 1.1 Centralized `DATABASE_URL` Engine Architecture
PlanetIQ standardizes all database connections across the FastAPI backend, Alembic migrations, background tasks, and offline scripts using a single authoritative configuration parameter: `DATABASE_URL`.

Behind the scenes, PlanetIQ's configuration engine (`app.core.config.Settings`) dynamically inspects and normalizes connection strings to support asynchronous and synchronous drivers simultaneously:
- **Asynchronous Driver (`asyncpg`)**: Auto-converted to `postgresql+asyncpg://...` for FastAPI route handlers, non-blocking telemetry streaming, and asynchronous database interactions.
- **Synchronous Driver (`psycopg` v3)**: Auto-converted to `postgresql+psycopg://...` for Alembic schema migrations, metadata reflection, and synchronous scientific ingestion workers.
- **Test Compatibility (`sqlite:///:memory:`)**: Automated pytest suites transparently utilize in-memory SQLite instances without driver conflicts.

### 1.2 Connection Pool Configuration & Lifecycle Management
To eliminate connection pool starvation and handle long-running scientific telemetry processing, PlanetIQ enforces the following pool parameters in `app.core.database`:
- **`DATABASE_POOL_SIZE`** (Default: `10`): Number of permanent connections maintained in the pool.
- **`DATABASE_MAX_OVERFLOW`** (Default: `20`): Maximum temporary connections allowed during query spikes.
- **`DATABASE_POOL_TIMEOUT`** (Default: `30`s): Maximum wait time before raising a connection timeout error.
- **`DATABASE_POOL_RECYCLE`** (Default: `1800`s / 30 min): Proactively recycles idle connections before cloud firewalls or Render proxy timeouts sever them.
- **Lifespan Shutdown Hook**: In `app.main.lifespan`, `close_database_connections()` cleanly disposes of all pooled database connections when the FastAPI service terminates or reloads.
- **Leak Prevention**: All repository reads and live ingestion persistence utilize the `session_scope()` context manager, guaranteeing that every session is committed and closed (or rolled back on error).

### 1.3 Render Internal vs. External Host Resolution
Render isolates managed PostgreSQL databases inside a private network:
1. **Render Internal URL (Backend Deployed Service)**:
   - Host format: `dpg-dbv2tp8m7kps73a36tog-a` (no domain suffix).
   - **Accessible ONLY within Render services** in the same region.
   - Zero egress latency and zero data transfer cost.
   - Example: `postgresql://planetiq_database_user:PASSWORD@dpg-dbv2tp8m7kps73a36tog-a/planetiq_database`
2. **Render External URL (Local Laptop, pg_dump, pg_restore, Remote Alembic)**:
   - Host format: `dpg-dbv2tp8m7kps73a36tog-a.frankfurt-postgres.render.com` (or your designated Render region).
   - Requires TLS/SSL encryption: `?sslmode=require`.
   - Accessible from outside Render (e.g., your Windows development workstation).
   - Example: `postgresql://planetiq_database_user:PASSWORD@dpg-dbv2tp8m7kps73a36tog-a.frankfurt-postgres.render.com/planetiq_database?sslmode=require`

---

## 2. Windows PowerShell Migration Procedures (Local to Render)

Follow these step-by-step PowerShell commands on your Windows development laptop to migrate your local database schema and data to your Render PostgreSQL instance.

### Prerequisites Check
Verify that `psql`, `pg_dump`, `pg_restore`, and Python are available in your PowerShell session:
```powershell
psql --version
pg_dump --version
python --version
```
*(If `pg_dump` is not recognized, add your PostgreSQL bin path to PATH, e.g.: `$env:PATH += ";C:\Program Files\PostgreSQL\16\bin"`)*

---

### Step 1: Export Data and Schema from Local Database
To prevent permission conflicts when importing into Render (where the database owner is `planetiq_database_user` rather than your local user `postgres` or `terralens_user`), use the `--no-owner --no-acl` flags:

```powershell
# Set local database parameters
$LOCAL_HOST = "localhost"
$LOCAL_PORT = "5432"
$LOCAL_USER = "terralens_user"
$LOCAL_DB = "terralens_db"
$DUMP_FILE = "planetiq_local_backup.dump"

# Export custom binary dump format (preserves geometry, indexes, and large tables)
$env:PGPASSWORD = "your_local_password_here"
pg_dump -h $LOCAL_HOST -p $LOCAL_PORT -U $LOCAL_USER -d $LOCAL_DB -F c -b -v --no-owner --no-acl -f $DUMP_FILE
Remove-Item Env:\PGPASSWORD
```

*(Alternatively, to create a plain SQL text export:)*
```powershell
$env:PGPASSWORD = "your_local_password_here"
pg_dump -h $LOCAL_HOST -p $LOCAL_PORT -U $LOCAL_USER -d $LOCAL_DB --no-owner --no-acl -f "planetiq_local_backup.sql"
Remove-Item Env:\PGPASSWORD
```

---

### Step 2: Run Alembic Migrations on Render PostgreSQL
Before restoring data, apply all Alembic migrations to ensure the PostGIS extension is created and tables match the exact model schema.

In PowerShell:
```powershell
cd c:\Users\ajumu\Downloads\PlanetIQ\backend

# Set the External Render Database URL with sslmode=require
$env:DATABASE_URL = "postgresql://planetiq_database_user:PASSWORD@dpg-dbv2tp8m7kps73a36tog-a.frankfurt-postgres.render.com/planetiq_database?sslmode=require"

# Apply all migrations up to head
python -m alembic upgrade head
```

Alembic will sequentially execute:
1. `d09126a812df_create_initial_scientific_tables.py`
2. `73c20df2d55b_create_postgis_tables.py` (idempotently ensures PostGIS spatial_bounds and GiST indexes)
3. `e1a2b3c4d5e6_quarantine_synthetic_records.py` (provenance and verification metadata columns)

---

### Step 3: Restore Data into Render Database
Restore your local records into the provisioned Render database:

```powershell
# Custom format (.dump) restore
$RENDER_HOST = "dpg-dbv2tp8m7kps73a36tog-a.frankfurt-postgres.render.com"
$RENDER_USER = "planetiq_database_user"
$RENDER_DB = "planetiq_database"

$env:PGPASSWORD = "YOUR_RENDER_DB_PASSWORD"
pg_restore -h $RENDER_HOST -p 5432 -U $RENDER_USER -d $RENDER_DB --verbose --no-owner --no-acl --data-only $DUMP_FILE
Remove-Item Env:\PGPASSWORD
```
*(Note: `--data-only` is recommended if Alembic has already initialized the schema, preventing any table recreation collisions.)*

---

### Step 4: Verify Database Contents and PostGIS
Connect to the Render database and verify table counts and PostGIS health:

```powershell
$env:PGPASSWORD = "YOUR_RENDER_DB_PASSWORD"
psql -h "dpg-dbv2tp8m7kps73a36tog-a.frankfurt-postgres.render.com" -U planetiq_database_user -d planetiq_database -c "SELECT postgis_full_version();"
psql -h "dpg-dbv2tp8m7kps73a36tog-a.frankfurt-postgres.render.com" -U planetiq_database_user -d planetiq_database -c "SELECT 'dataset_catalogs' AS table, count(*) FROM dataset_catalogs UNION ALL SELECT 'earth_observations', count(*) FROM earth_observations UNION ALL SELECT 'observation_timeseries', count(*) FROM observation_timeseries UNION ALL SELECT 'cross_system_records', count(*) FROM cross_system_records;"
Remove-Item Env:\PGPASSWORD
```

---

## 3. Production Environment Variables Configuration (Render Dashboard)

When configuring your web service on Render (`https://dashboard.render.com/`):

1. Navigate to your **PlanetIQ Backend Web Service** -> **Environment**.
2. Set the following environment variables:

| Variable | Recommended Production Value | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql://planetiq_database_user:PASSWORD@dpg-dbv2tp8m7kps73a36tog-a/planetiq_database` | **Render Internal URL** (uses internal DNS, no bandwidth billing, high throughput) |
| `DATABASE_POOL_SIZE` | `10` | Number of persistent pooled connections |
| `DATABASE_MAX_OVERFLOW` | `20` | Max overflow connections |
| `DATABASE_POOL_TIMEOUT` | `30` | Pool acquisition timeout in seconds |
| `DATABASE_POOL_RECYCLE` | `1800` | Recycles connections after 30 minutes |
| `ENVIRONMENT` | `production` | Deployment mode |
| `DEBUG` | `false` | Disables debug mode in production |
| `CORS_ORIGINS` | `["https://planetiq-1.onrender.com"]` | Authorized frontend origins |
| `GEMINI_API_KEY` | *(Your Google AI Studio API Key)* | Required for AI Research Assistant |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Standard high-speed reasoning model |
| `NASA_EARTHDATA_USERNAME` | *(Your NASA Earthdata username)* | Required for live satellite granule downloads |
| `NASA_EARTHDATA_PASSWORD` | *(Your NASA Earthdata password)* | Required for live satellite granule downloads |
| `NASA_EARTHDATA_BEARER_TOKEN` | *(Optional Bearer Token)* | Optional alternative token authentication |

---

## 4. PostGIS Polygon Geometry & GiST Indexing

PlanetIQ defines spatial footprints for all satellite observations using standard OGC geometry in WGS84 (`EPSG:4326`).

### Model Definition (`app.models.observation.EarthObservation`)
```python
spatial_bounds = Column(
    Geometry(geometry_type="POLYGON", srid=4326, spatial_index=True),
    nullable=True,
    doc="WGS84 bounding polygon of genuine satellite observation footprint."
)
```

### GiST Spatial Index Verification
To confirm that PostgreSQL is utilizing index acceleration for spatial bounding box queries:
```sql
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'earth_observations' AND indexname LIKE '%spatial%';
```
Expected output:
```
CREATE INDEX idx_earth_observations_spatial_bounds ON public.earth_observations USING gist (spatial_bounds)
```

---

## 5. Troubleshooting & FAQ

### Issue: `psql: error: could not translate host name "dpg-dbv2tp8m7kps73a36tog-a" to address`
**Cause**: You are attempting to connect to Render's internal hostname from your personal laptop.  
**Resolution**: Use the external hostname with `.frankfurt-postgres.render.com` (or region) and append `?sslmode=require`.

### Issue: `ERROR: role "postgres" does not exist` during restore
**Cause**: The dump file contains ownership reassignment statements (`ALTER TABLE ... OWNER TO postgres;`).  
**Resolution**: Always dump and restore with `--no-owner --no-acl`.

### Issue: `ERROR: permission denied to create extension "postgis"`
**Cause**: Connecting as a user without superuser privileges when creating extensions.  
**Resolution**: Render's primary database user (`planetiq_database_user`) is granted extension creation privileges. If running into issues, enable PostGIS in the Render database console or run `CREATE EXTENSION IF NOT EXISTS postgis;` using the primary admin connection.

### Issue: Connection pool exhaustion (`TimeoutError: QueuePool limit of size 10 overflow 20 reached`)
**Cause**: Long network calls or unclosed sessions.  
**Resolution**: PlanetIQ decouples NASA downloads from database sessions and enforces the `session_scope()` context manager. Ensure any custom queries run within `with session_scope() as session:`.
