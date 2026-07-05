# Free Public Deployment

This app deploys as two public services:

- Frontend: Vercel, serving the React app from `frontend`
- Backend API: Render, running FastAPI from `backend`
- Database: existing Supabase Postgres project

## 1. Deploy The Backend On Render

1. Open Render and choose **New > Blueprint**.
2. Connect the GitHub repo: `gpepeitan/pesach`.
3. Render will read `render.yaml` and create the `pesach-api` web service.
4. Fill the required environment variables:
   - `DATABASE_URL`: Supabase transaction pooler URL using the `postgresql+asyncpg://...` format
   - `ADMIN_USERNAME`: staff admin login username
   - `ADMIN_PASSWORD`: strong staff admin login password
   - `ADMIN_DISPLAY_NAME`: display name for the seeded admin
   - `CORS_ORIGINS`: start with `*`, then replace with the Vercel URL after frontend deploy
5. Keep `DEV_AUTH_BYPASS=0` for public hosting.
6. Confirm the health check works:
   - `https://YOUR-RENDER-SERVICE.onrender.com/api/health`

## 2. Deploy The Frontend On Vercel

1. Open Vercel and choose **Add New Project**.
2. Import the GitHub repo: `gpepeitan/pesach`.
3. Set **Root Directory** to `frontend`.
4. Set the environment variable:
   - `REACT_APP_BACKEND_URL=https://YOUR-RENDER-SERVICE.onrender.com`
5. Use these build settings:
   - Install command: `corepack yarn install --ignore-optional`
   - Build command: `corepack yarn build`
   - Output directory: `build`
6. Deploy.

## 3. Lock Backend CORS

After Vercel gives you a public URL, go back to Render and set:

```text
CORS_ORIGINS=https://YOUR-VERCEL-APP.vercel.app
```

Then redeploy the Render service.

## Public URLs

- Guest intake form: `https://YOUR-VERCEL-APP.vercel.app/`
- Staff login: `https://YOUR-VERCEL-APP.vercel.app/staff/login`
- Backend health: `https://YOUR-RENDER-SERVICE.onrender.com/api/health`

## Notes

- Render free services can sleep when unused, so the first request may be slow.
- Never put `DATABASE_URL`, `JWT_SECRET`, or admin passwords in the frontend environment.
- If Render reports database connection failures, check that the Supabase password is URL-encoded and that the URL starts with `postgresql+asyncpg://`.
