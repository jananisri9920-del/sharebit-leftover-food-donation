# ShareBit — Full-stack leftover food donation website

ShareBit is a responsive Node.js + Express + MongoDB website. It includes account registration/login, donor and receiver roles, food donation publishing, public searchable listings, receiver requests, role-based donor/receiver/admin dashboards, donation status updates, and a community impact summary.

## What you need

- Node.js 18 or newer
- A MongoDB Atlas account/database
- A GitHub account for easy deployment
- A Render account (or another Node.js host)

## Run on your computer

1. Extract the ZIP.
2. Open the extracted `sharebit_fullstack` folder in VS Code.
3. Install Node.js if it is not installed: https://nodejs.org/
4. Open VS Code Terminal in this folder and run:
   ```bash
   npm install
   ```
5. Copy `.env.example` to a new file named `.env`.
6. In `.env`, set `MONGODB_URI` to your MongoDB Atlas connection string. Replace the sample `JWT_SECRET` with a long random secret. Do not share `.env` or upload it to GitHub.
7. Start the app:
   ```bash
   npm start
   ```
8. Open http://localhost:3000

## Set up MongoDB Atlas

1. Create a free cluster at https://www.mongodb.com/atlas.
2. Create a database user and a strong password.
3. In Network Access, allow access from your deployment host. For a quick test, Atlas offers `0.0.0.0/0`; it permits connections from anywhere, so use a strong database password and restrict access when possible.
4. Choose Connect → Drivers and copy the Node.js connection string.
5. Put it in `.env` as `MONGODB_URI=...`; replace the password and database name as needed.
6. Restart the server.

## Publish it online so anyone can use the link

The source code is ready to deploy, but a public website URL is not created until you deploy it with your own hosting/database accounts.

### Recommended simple route: GitHub + Render

1. Create a new private or public GitHub repository and upload these project files. **Do not upload `.env` or passwords.**
2. In Render, choose New → Web Service and connect that repository.
3. Use:
   - Build command: `npm install`
   - Start command: `npm start`
4. In Render's Environment settings, add `MONGODB_URI` and `JWT_SECRET`. Add `ADMIN_EMAIL` if you want to use it as a note for your administrator account.
5. Deploy. Render will provide a public HTTPS URL, such as `https://your-service-name.onrender.com`.
6. Open the public URL on your phone and another device to test it.

Free hosting plans and limits can change. A free service may sleep when idle, so the first request can take longer.

## Create the admin account

For safety, the public registration form never allows someone to register as admin.

1. Register normally with the email you want to use as administrator.
2. In MongoDB Atlas, open the `users` collection in the `sharebit` database.
3. Find that account by email and change its `role` field from `"donor"` or `"receiver"` to `"admin"`.
4. Log out and log in again so the account receives a new admin token.

The app includes a role-based dashboard UI: donors can manage requests and mark donations collected, receivers can review their requests, and admins can view users and community donations. Email/SMS notifications and email verification are not included.

## Main API routes

- `GET /api/health` — deployment health check
- `POST /api/auth/register` — create donor/receiver account
- `POST /api/auth/login` — log in
- `GET /api/auth/me` — current account
- `GET /api/donations` — public available listings; supports `?search=rice`
- `POST /api/donations` — publish a donation (Bearer token required)
- `POST /api/donations/:id/request` — receiver requests food
- `PATCH /api/donations/:id/status` — donor/admin updates status
- `GET /api/dashboard` — community counters
- `GET /api/admin/overview` — admin-only user and donation data

## Important real-world notes

- Only donate food that has been handled and stored safely. Donors should describe allergens and pickup conditions.
- Before a real public launch, add email/phone verification, rate limiting, password reset, moderation/reporting, privacy policy, terms, and robust audit logging.
- This starter stores JWTs in browser local storage for simplicity. For a production service, consider secure, HTTP-only cookies and additional security hardening.
- Food pickup and safety are coordinated by users; the site does not verify food quality or guarantee delivery.
