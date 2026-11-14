# CodeRabbit Automated Code Review Integration

This document defines the configuration, automated review workflow, GitHub App setup, and autonomous fix protocols for CodeRabbit on **TerraLens (PlanetIQ)**.

---

## 1. Official GitHub App Setup & Authorization

To enable automated pull request reviews by CodeRabbit:

1. **Install GitHub App**:
   * Visit the official CodeRabbit application page: [`https://github.com/apps/coderabbitai`](https://github.com/apps/coderabbitai) or sign in at [`https://coderabbit.ai/`](https://coderabbit.ai/).
2. **Authorize Repository Access**:
   * Under **Repository Access**, select **"Only select repositories"** and choose:
     ```
     ajmaldevs/PlanetIQ
     ```
   * Grant read access to code and metadata, and write access to pull requests (for posting review comments).
3. **Configure Review Target Branches**:
   * Enable automated pull request reviews for:
     - `development` (ongoing feature pull requests)
     - `main` (production release pull requests)

---

## 2. Repository Configuration: `.coderabbit.yaml`

The configuration file [`.coderabbit.yaml`](file:///C:/Users/ajumu/Downloads/PlanetIQ/.coderabbit.yaml) governs CodeRabbit's behavior:

* **Review Profile**: `assertive` (thorough analysis of logic, security, and performance).
* **High-Level Summary**: Enabled with collapsible commit walkthroughs.
* **Excluded Paths**: Excludes vendor directories (`node_modules/`, `.venv/`, `dist/`), raw data (`data/raw/`), and lockfiles (`package-lock.json`, `uv.lock`).
* **Path-Specific Scientific Instructions**:
  - **Atmosphere (`backend/app/services/atmosphere_service.py`)**: Strict enforcement of precipitation rate (mm/hr) vs monthly accumulation (mm) calculation.
  - **Ocean (`backend/app/services/ocean_service.py`)**: SSHA units in meters and eddy sign convention verification.
  - **Land (`backend/app/services/land_service.py`)**: Radiometric NDVI bounds `[-0.2000, 1.0000]` and VCI scaling.
  - **Cross-System (`backend/app/services/cross_system_service.py`)**: Strict enforcement of the principle that *correlation does not equal causation*.
  - **Security (`backend/app/core/`)**: Zero hardcoded secrets, safe Pydantic settings, and graceful database fallbacks.
  - **Frontend (`frontend/src/`)**: Type safety, WebGL cleanup, and explicit axis/tooltip unit labeling.

---

## 3. Continuous Review & Autonomous Fix Workflow

For every major development milestone:

```
[ Local Development & Tests ] ──▶ [ Git Push to `development` ] ──▶ [ Create GitHub PR to `main` ]
                                                                             │
                                                                             ▼
                                                                 [ CodeRabbit Auto-Review ]
                                                                             │
                                                                             ▼
[ Update PR & Retest ] ◀── [ Autonomous Review & Fix ] ◀── [ Categorize Findings by Severity ]
```

### Review Categorization & Response Matrix:
1. **Critical / High (Bugs, Security Vulnerabilities, Scientific Conflation)**:
   - Must be fixed immediately.
   - Retest with automated test suite (`python -m pytest tests`, `scripts/validate_scientific_datasets.py`, `npm run build`).
2. **Medium (Performance, Unbounded Queries, Type Inconsistencies)**:
   - Evaluated and refactored if beneficial.
3. **Low / Nitpick (Stylistic Preferences)**:
   - Applied if they improve code clarity without bloating diffs.
4. **False Positives / Incorrect Scientific Suggestions**:
   - Explicitly rejected with scientific citations (e.g. if CodeRabbit suggests substituting standard NDVI formulas or altering physical unit conversions).

---

## 4. Recommended GitHub Branch Protection for `main`

To maintain production stability in `ajmaldevs/PlanetIQ`:

1. Navigate to: **GitHub Repo Settings -> Branches -> Add branch protection rule**.
2. **Branch name pattern**: `main`.
3. Enable:
   - **Require a pull request before merging**:
     - Require at least 1 approval.
   - **Require status checks to pass before merging**:
     - `TerraLens CI / Backend Validation`
     - `TerraLens CI / Frontend Validation`
     - `CodeRabbit`
   - **Require linear history**: Keep commit history clean and traceable.
   - **Do not allow bypassing the above settings**: Enforce across all contributors.
   - **Restrict force pushes & deletions**: Completely disabled.
