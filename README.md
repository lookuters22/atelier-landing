# Atelier Studio OS

Photographer dashboard prototype (Vite + React + TypeScript + Tailwind).

## Local

```bash
npm install
npm run dev
```

### Service area map picker (onboarding)

The scope step ships bundled geography data under `public/serviceAreaPicker/` (`labels.json`, `polygons.json`). Sources: **Natural Earth** (public domain) and **GeoNames** `cities15000` ([CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/)). To rebuild after upstream data changes:

```bash
npm run build:service-area-dataset
```

See [docs/v3/ONBOARDING_SERVICE_AREA_MAP_PICKER_IMPLEMENTATION.md](docs/v3/ONBOARDING_SERVICE_AREA_MAP_PICKER_IMPLEMENTATION.md) (historical v1 doc; execution plan is `.cursor/plans/service_area_map_picker_4565a808.plan.md`).

## Deploy (Vercel)

1. Push this repo to GitHub (see below).
2. [vercel.com](https://vercel.com) → Add New → Project → Import the repo.
3. Leave defaults (Vite). `vercel.json` routes client-side navigation to `index.html`.

## Push to GitHub (Windows — easiest)

Your folder is already a git repo on branch `main`, and `origin` is set to this project. You only need to **authenticate** once.

### Option A — Cursor / VS Code (recommended)

1. Open this folder in **Cursor**: `File → Open Folder → Desktop\wedding`.
2. Click the **Source Control** icon in the left sidebar (branch / lines icon).
3. Click **Sync** or **Publish Branch** / **Push** (wording varies).
4. When a **browser or sign-in window** opens, choose **GitHub** and approve.  
   After that, pushes use saved login.

### Option B — GitHub Desktop

1. Install [GitHub Desktop](https://desktop.github.com/).
2. **File → Add Local Repository** → choose `Desktop\wedding`.
3. **Publish repository** (or **Push origin** if the repo already exists on GitHub).

### Option C — Terminal + Personal Access Token

1. Create a token: GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Generate** (enable **repo**).
2. Open **PowerShell** in the project folder:

   ```powershell
   cd $env:USERPROFILE\Desktop\wedding
   git push -u origin main
   ```

3. If it asks for credentials: **Username** = your GitHub username. **Password** = paste the **token** (not your GitHub password).

Remote is already configured:

`https://github.com/lookuters22/atelier.git`
