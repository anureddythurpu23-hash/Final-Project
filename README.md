# Student Project Submission and Mentor Review

A beginner-friendly full-stack college project where students submit software project details and mentors review the work, rate it, and leave feedback.

## 1. Problem statement

Project details are often shared through scattered messages or documents, making it difficult for students to track progress and for mentors to give consistent feedback. ProjectHub provides one place to submit work, check its status, and keep review feedback attached to the submission.

## 2. Objectives

- Let students create an account and submit project descriptions and links.
- Let students track review status and read feedback.
- Let authorized mentors review submissions, assign a 1–5 rating, and request revisions or approve projects.
- Store application data persistently in Supabase PostgreSQL.
- Demonstrate client-server communication, REST APIs, authentication, validation, and relational database design.

## 3. Users and features

### Student
- Register and sign in.
- Create a submission with title, description, optional GitHub URL and optional live-demo URL.
- View, search, and filter their submissions.
- Edit or delete a submission while it is `submitted` or `revision_requested`.
- Read mentor feedback and rating.

### Mentor
- Sign in to a mentor account that has been promoted by an authorized administrator.
- View all student submissions and student names.
- Set status to `in_review`, `revision_requested`, or `approved` (the form also allows `submitted`).
- Give a rating from 1 to 5 and written feedback.

## 4. Technology stack

- HTML5, CSS3, Vanilla JavaScript
- Node.js 20 or later, Express.js
- Supabase PostgreSQL
- bcryptjs for password hashing, jsonwebtoken for signed login tokens, dotenv for configuration, Helmet for security headers, express-rate-limit for limiting authentication attempts
- Git and GitHub

## 5. Folder structure

```text
student-project-submission-mentor-review/
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── backend/
│   ├── server.js
│   ├── supabase.js
│   ├── middleware/
│   │   └── auth.js
│   ├── routes/
│   │   ├── auth.js
│   │   └── submissions.js
│   ├── package.json
│   ├── .env
│   ├── .env.example
│   └── .gitignore
├── database/
│   └── schema.sql
├── .gitignore
└── README.md
```

## 6. Prerequisites

Install these on your computer:
- [Visual Studio Code](https://code.visualstudio.com/)
- [Node.js LTS](https://nodejs.org/) (npm is included)
- [Git](https://git-scm.com/downloads)
- A free [Supabase account](https://supabase.com/)
- A [GitHub account](https://github.com/) for version control

Check installation in a new VS Code terminal:

```powershell
node --version
npm --version
git --version
```

Node.js should be version 20 or later.

## 7. Supabase database setup

1. Sign in to Supabase and create a new project. Save the database password securely; this app uses the project API credentials rather than a direct database connection string.
2. Open the project dashboard and choose **SQL Editor**.
3. Open `database/schema.sql` in VS Code, copy all of it, paste it into a new SQL Editor query, and run it.
4. Open **Table Editor** and verify that `app_users`, `project_submissions`, and `project_reviews` exist.
5. In the Supabase project settings, open the API/keys section. Copy the project URL and the server-side service-role/secret key. Supabase labels may differ between projects. Use a server-side privileged key only in `backend/.env`.

The backend uses a server-side service-role client, so requests bypass Row Level Security (RLS). The API must therefore enforce login, role checks, and ownership checks on every protected action. RLS is enabled on the tables as defense-in-depth. Never put the service-role key in frontend files or GitHub.

## 8. Environment configuration

In VS Code, open the `backend` folder in the terminal and copy the example file:

```powershell
Copy-Item .env.example .env
```

Open `backend/.env` and replace the placeholders:

```dotenv
PORT=3000
NODE_ENV=development
SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_SIDE_SECRET_KEY
JWT_SECRET=REPLACE_WITH_A_LONG_RANDOM_SECRET
JWT_EXPIRES_IN=8h
```

Generate a random JWT secret from the `backend` directory:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Copy the output into `JWT_SECRET`. Keep `.env` private. `.env.example` is a safe template and should be committed; `.env` must not be committed.

## 9. Install and run

Open the project root folder in VS Code. Open **Terminal → New Terminal** and run:

```powershell
cd backend
npm install
npm run check
npm start
```

Expected server message:

```text
ProjectHub is running at http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000) in your browser. The health endpoint is [http://localhost:3000/api/health](http://localhost:3000/api/health) and should return JSON similar to `{"status":"ok","service":"projecthub-api"}`.

For development with automatic restart (Node 20+), use `npm run dev` instead of `npm start`.

## 10. Create a mentor account

Public registration intentionally creates student accounts only; users cannot select their own mentor role. To create a mentor:

1. Register the intended mentor's email through the app.
2. In Supabase SQL Editor, run the following with that exact email:

```sql
update public.app_users
set role = 'mentor'
where email = 'mentor@example.edu';
```

3. Log out and log in again. The API loads the current role from the database on each authenticated request. Only a trusted project/database administrator should perform this promotion.

## 11. Architecture and request flow

1. The browser renders `frontend/index.html`, `styles.css`, and `app.js`.
2. `app.js` uses `fetch()` to call the Express REST API.
3. Express validates request data and verifies the signed JWT for protected routes.
4. `middleware/auth.js` loads the user's current role from PostgreSQL.
5. `routes/submissions.js` enforces role and ownership rules, then queries Supabase.
6. Supabase stores users, submissions, and reviews in PostgreSQL.

Passwords are hashed with bcryptjs and are never returned by the API. JWTs expire after the configured period. For a production deployment, consider moving tokens from browser local storage to secure, HttpOnly cookies and adding a CSRF strategy if cookie-based authentication is used. This educational MVP uses bearer tokens in browser local storage; protect devices and do not use it for sensitive production data.

## 12. REST API reference

All responses are JSON. Protected endpoints require `Authorization: Bearer YOUR_TOKEN`.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/health` | Public | Check server status |
| POST | `/api/auth/register` | Public | Create a student account; body: `name`, `email`, `password` |
| POST | `/api/auth/login` | Public | Sign in; body: `email`, `password` |
| GET | `/api/auth/me` | Logged-in user | Return current profile |
| GET | `/api/submissions` | Student / mentor | Students see their own submissions; mentors see all |
| POST | `/api/submissions` | Student | Create a submission; body: `title`, `description`, optional `github_url`, `demo_url` |
| PATCH | `/api/submissions/:id` | Owner student | Edit a submission in `submitted` or `revision_requested` status |
| DELETE | `/api/submissions/:id` | Owner student | Delete a submission in `submitted` or `revision_requested` status |
| POST | `/api/submissions/:id/review` | Mentor | Add/update review; body: `status`, integer `rating` (1–5), `feedback` |

Typical errors include `400` invalid input, `401` missing/invalid/expired login token, `403` insufficient role, `404` missing or non-owned submission, `409` duplicate email or disallowed status change, `413` oversized request, and `500` unexpected server/database failure. Internal database details are not returned to clients.

## 13. Main workflow

1. A student registers and is taken to their dashboard.
2. The student selects **Submit project**, fills in a title and a description of at least 20 characters, and optionally adds project URLs.
3. The submission appears with status **Submitted**.
4. An authorized mentor logs in and opens the submission.
5. The mentor selects a status, a 1–5 rating, and writes feedback.
6. The student refreshes or revisits the dashboard to see the status and feedback.
7. If revision is requested, the student may edit and resubmit the project.

## 14. Testing checklist

| Test | Expected result |
|---|---|
| Open `/api/health` | JSON status is `ok` |
| Register with valid details | Account created and dashboard opens |
| Register same email twice | `409` duplicate-account message |
| Register with short password | Friendly validation error |
| Log in with wrong password | `401` error; no token issued |
| Create valid project | Record appears after database save |
| Submit too-short description | `400` validation error |
| Submit invalid URL | `400` validation error |
| Search/filter submissions | List updates to matching records |
| Edit your pending submission | Updated values persist after reload |
| Delete your pending submission | Submission disappears from database/list |
| Student attempts mentor review | `403` permission error |
| Student requests another user's submission by ID | No access; API returns not found for owner-only update/delete |
| Mentor reviews a submission | Status, rating, and feedback persist |
| Reload the page | Data is loaded from the API/database, not browser-only state |
| View at mobile width | Layout adapts to a narrow screen |
| Use expired/invalid token | Protected API returns `401` |

You can also run `npm run check` from `backend/` to check JavaScript syntax. These checks do not verify your remote Supabase credentials; test the health endpoint and actual app after configuring your own project.

## 15. Troubleshooting

- **Server exits saying `JWT_SECRET` is missing:** confirm `backend/.env` exists and has a secret at least 32 characters long; restart the server after edits.
- **Supabase configuration error:** check the project URL and server-side key for typos. Do not paste keys into frontend JavaScript.
- **Database/table not found:** run the full `database/schema.sql` in the correct Supabase project and verify all three tables in Table Editor.
- **API returns 500:** check the backend terminal for the server-side diagnostic message. Verify schema, credentials, and network access. The browser intentionally receives a generic error.
- **`401` after waiting:** the JWT expires; log in again.
- **A mentor sees student mode:** verify the email was promoted in `app_users`, then log out and log back in.
- **Port 3000 already in use:** set `PORT=3001` in `backend/.env`, restart, and open `http://localhost:3001`.
- **`npm` not recognized:** reinstall Node.js LTS and restart VS Code/terminal.

## 16. Git and GitHub upload

Create an empty repository on GitHub. Do not add a README there if you already have this local README, to avoid a first-push conflict. In the project root terminal:

```powershell
git init
git status
git add .
git status
git commit -m "Build project submission and mentor review app"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

Replace `YOUR_GITHUB_REPOSITORY_URL` with the URL copied from your GitHub repository. Verify the project files appear on GitHub. Before `git add .`, ensure `backend/.env`, all real credentials, `node_modules/`, private user data, and database exports are excluded. `.env.example` should be included.

**Important:** `.gitignore` does not remove a secret that was already committed. If you accidentally push a secret, rotate/revoke it immediately, then remove it from repository history as appropriate.

## 17. Limitations and future improvements

This MVP stores project links and descriptions; it does not upload project files. It supports one current review per submission, rather than a full review history or multiple mentor approvals. It has no email notifications or public deployment configuration. Possible extensions include file uploads with safe storage, review history, due dates, mentor assignment, pagination, automated API tests, and a production-ready cookie-based authentication flow.

## 18. Security notes

- Never commit `.env` or share your service-role key.
- Public registration always assigns `student`; mentor promotion is an administrative action.
- Keep Node.js dependencies updated and use HTTPS in deployment.
- The backend checks ownership and role before sensitive actions. Do not remove those checks just because the UI hides buttons.
- The service-role key bypasses RLS. If you later add direct browser-to-Supabase access, redesign authentication and RLS policies before exposing any table.
