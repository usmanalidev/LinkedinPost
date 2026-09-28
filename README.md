# LinkedIn Poster

A private site that posts text to your own LinkedIn profile. The LinkedIn client secret and access token stay in this app. A bot, including a Grok action, calls one endpoint with a username and password.

Stack: Next.js on Vercel Hobby ($0). LinkedIn tokens are stored in a private Vercel Blob store, which is included on Hobby within the free usage caps. Locally, tokens are saved in `.data/tokens.json`.

This posts as the member who connects the app. It publishes text only.

## What you need from LinkedIn

1. Open [LinkedIn Developers](https://www.linkedin.com/developers/apps) and create an app.
2. On the Products tab, add **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn**. Share on LinkedIn grants `w_member_social`, which is the permission that creates a post.
3. On the Auth tab, add this redirect URL after you know the Vercel domain:

   `https://YOUR-APP.vercel.app/api/auth/callback`

   For local development also add:

   `http://localhost:3000/api/auth/callback`

4. Copy the client id and client secret into the environment variables below.

In development mode, LinkedIn only lets people listed on the app authorize it. That is the right setup for posting as yourself. An access token lasts about 60 days. A refresh token, when LinkedIn issues one, lasts about a year. The app refreshes and saves the new token when a Blob store is connected.

LinkedIn applies per-member rate limits. Confirm the current limit in your developer app. Text posts use `POST https://api.linkedin.com/rest/posts` with version header `202609`.

## Environment

Copy `.env.example` to `.env.local` for local work, and set the same keys in the Vercel project.

| Name | Purpose |
| --- | --- |
| `AUTH_USERNAME` | Username for the website and the bot |
| `AUTH_PASSWORD` | Password, at least 8 characters. This is the only secret the bot receives. |
| `LINKEDIN_CLIENT_ID` | LinkedIn app client id |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn app client secret |
| `APP_URL` | Production origin, such as `https://your-app.vercel.app` |
| `LINKEDIN_VERSION` | `202609` unless LinkedIn has moved the active version |
| `BLOB_READ_WRITE_TOKEN` | Set by Vercel when you connect a private Blob store |

Pick a username and a password of at least 8 characters. Do not put the LinkedIn client secret in the bot.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, sign in with `AUTH_USERNAME` and `AUTH_PASSWORD`, then connect LinkedIn.

## Deploy on Vercel Hobby

1. Push this folder to its own Git repository. Do not deploy it from the resume-generator app.
2. Import the repository at [vercel.com/new](https://vercel.com/new). Hobby is the free plan and fits a personal project.
3. Add the environment variables. Set `APP_URL` to the production domain Vercel assigns, or to your custom domain.
4. In the Vercel project, open Storage, create a **private** Blob store, and connect it to this project. That adds `BLOB_READ_WRITE_TOKEN`. Redeploy so the function can read it.
5. Register `https://YOUR-APP.vercel.app/api/auth/callback` on the LinkedIn app. It must match exactly.
6. Set `LINKEDIN_ACCESS_TOKEN` and `LINKEDIN_PERSON_URN` in the project environment. Open the site and sign in with the username and password. Publishing uses that access token.

If Blob is not connected, the callback page shows the tokens once so you can paste them into environment variables. That mode works until the access token expires, and it cannot save a refresh.

## Bot contract

```http
POST /api/post
Authorization: Basic base64(AUTH_USERNAME:AUTH_PASSWORD)
Content-Type: application/json

{"text":"The post text.","visibility":"PUBLIC"}
```

The same username and password can be sent in the JSON body when the bot cannot set a header:

```json
{"username":"AUTH_USERNAME","password":"AUTH_PASSWORD","text":"The post text.","visibility":"PUBLIC"}
```

`visibility` may be `PUBLIC` or `CONNECTIONS`. It defaults to `PUBLIC`. `text` is required and must be 1–3000 characters.

Success:

```json
{"ok":true,"id":"urn:li:share:...","visibility":"PUBLIC","createdAt":"2026-09-28T06:42:00.000Z","historySaved":true}
```

Each attempt is stored with the time, text, visibility, source, and LinkedIn id. The site shows that history after you sign in. The newest 100 entries are kept.

For a Grok bot, add an HTTP action with that URL and basic authentication, or put the username and password in the JSON body. Leave the LinkedIn client id, client secret, and access token out of the bot.

A wrong username or password returns `401`. A missing LinkedIn connection returns `409`.
