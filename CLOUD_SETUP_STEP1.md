# UniLost v2.9.4 - Step 1 cloud preparation

This folder was prepared by `UniLost_v2.9.4_Buoc1_ChuanBiCloud.bat`.

## Applied changes
- Backend binds to 0.0.0.0 in production; localhost behavior remains in development.
- In production, the original boot-time data migration block is skipped. The original development boot behavior is unchanged.
- Production requires MONGO_URI, JWT_SECRET (32+ chars), ADMIN_EMAIL, ADMIN_PASSWORD (not Admin@123).
- Backend CORS accepts FRONTEND_URL in addition to local dev origins.
- frontend/vercel.json handles SPA fallback, but API and uploaded-image rewrites are NOT configured yet.
- frontend/vercel.rewrites.example.json is a TEMPLATE: after Render gives you the backend URL, replace its sample domain and use it as frontend/vercel.json.
- backend/.env.cloud.example is a TEMPLATE. Real secrets belong only in Render environment settings.
- .gitignore excludes local secrets, node_modules, uploads, and cloud-preparation backups.

## Important outstanding work (NOT completed by Step 1)
1. Real MongoDB Atlas, Render, Vercel and GitHub configuration.
2. GitHub Actions CI/CD and GitHub Secrets.
3. Email: SMTP on Render Free can be blocked; use supported hosting or HTTPS email API.
4. Uploaded images: backend stores files locally; persistent object storage is needed before production use.
5. Review the boot-time seed/ensureRequiredData behavior, especially category/location/admin changes.
6. Before publishing: run existing automated tests and review authorization, CORS and secrets.

## Backups
Modified files are backed up under `.cloud_step1_backup_YYYYMMDD_HHMMSS/`.
Do not upload the backup folder to GitHub.

## Verification commands (requires Node.js >=22.12)
From backend: `npm ci` then `npm test`.
From frontend: `npm ci` then `npm run build`.

Do not run `npm run seed` against a live database. Do not commit real `.env` files.