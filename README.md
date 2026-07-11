# ID Channel

Private messaging by **public ID** — no email, no phone.  
Runs entirely on a **free cloud host** (Render). No physical home server needed.

## How it works

1. **Join** with a username + password.
2. Server generates a **public ID** (e.g. `AX7K-9M2P`) and a one-time **recovery phrase**.
3. Share your public ID. Others send a **contact request**.
4. After **accept**, real-time 1:1 chat (works on any internet connection).

| Piece | Purpose |
|--------|---------|
| Username + password | Sign in |
| Public ID | How others find you |
| Recovery phrase | Reset password (shown once at signup) |

## Live deploy (free cloud — no PC server)

### One-click on Render (recommended)

1. Open:  
   **https://render.com/deploy?repo=https://github.com/UkcuF-774/id-channel**
2. Sign up / log in with **GitHub** (free).
3. Click **Apply** / **Create Web Service** (plan: **Free**).
4. Wait for the build → open the `*.onrender.com` URL.

**Note:** Free plan sleeps after ~15 minutes of no traffic. First visit can take ~30–60s to wake. Chat works normally while awake.

Custom domain (optional): in Render → your service → **Settings → Custom Domains** → add `chat.lamarti.in`, then in GoDaddy DNS add:

| Type | Name | Value |
|------|------|--------|
| CNAME | `chat` | `your-service.onrender.com` |

## Run locally (optional)

```bash
npm install
npm run dev
```

- UI: http://localhost:5173  
- API: http://localhost:3000  

## Security notes (MVP)

- Passwords and recovery phrases are hashed (bcrypt).
- Sessions use HTTP-only cookies + JWT.
- Free Render disk is ephemeral: redeploys can reset the database.
