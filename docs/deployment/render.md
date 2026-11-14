# Deploy TerraLens on Render

The repository root contains a Render Blueprint at [`render.yaml`](../../render.yaml). It provisions the React static site, FastAPI service, and PostgreSQL database, then applies the database migrations before starting the API.

## Deploy

1. Push the branch you want to deploy to GitHub.
2. In Render, choose **New → Blueprint** and connect the PlanetIQ repository.
3. Select the branch containing `render.yaml`, review the three resources, and apply the Blueprint.
4. Wait for the static site and database to finish provisioning. Render deploys the backend after the frontend is available so it can read the exact frontend origin for CORS.
5. Open the `terralens-frontend` static site URL. The API URL is `https://terralens-backend.onrender.com`; its health endpoint is `/api/v1/health`, and its OpenAPI docs are at `/docs`.

The static build receives `VITE_API_BASE_URL` from `render.yaml`. If you rename the backend service or assign a different backend domain, update that value and redeploy the static site. If you add a custom frontend domain, add its full HTTPS origin to the backend's `CORS_ORIGINS` environment variable and redeploy the backend.

## Environment and data

- Render supplies the database host, port, name, user, and password through Blueprint references. The Alembic pre-deploy command enables PostGIS through the initial migration and creates the schema.
- `GEMINI_API_KEY` is optional. The assistant uses its non-Gemini fallback when the key is empty. To enable Gemini, add the key to the backend service's Environment page and deploy the service again.
- NASA Earthdata credentials are not required by this build. The Ocean, Atmosphere, and Land screens currently display clearly labelled modelled demo data; this deployment does not ingest live NASA observations.
- `CORS_ORIGINS` is wired to the frontend's Render HTTPS URL. Local development origins remain allowed by the backend's local-origin regex.

## Verify the deployment

1. Open `https://terralens-backend.onrender.com/api/v1/health` and confirm it returns HTTP 200 and reports the database as connected with PostGIS available.
2. Open the frontend and verify that the header reports the API as connected.
3. Refresh a nested frontend route to confirm the static site's SPA rewrite returns the app.
4. Search for a location and switch between 2D and 3D to confirm the API-backed search and map navigation work.

Blueprint environment variables for static sites are applied at build time, so changing the frontend API URL requires a new static-site build. See [Render's Blueprint reference](https://render.com/docs/blueprint-spec) and [environment variable guide](https://render.com/docs/configure-environment-variables).
