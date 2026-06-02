# 🏆 THE WAGER — Deploy Guide
### ~15 minutes. No coding required.

---

## STEP 1 — Firebase (live sync database)

1. Go to **https://firebase.google.com** → sign in with Google → **Go to console**
2. **Add project** → name it `the-wager` → click through
3. Left sidebar: **Build → Realtime Database → Create database**
4. Pick any region → choose **"Start in test mode"** → Enable

### ⚠️ CRITICAL — Secure your database properly

Test mode expires after 30 days AND is wide open to the internet. Do this immediately:

5. In Realtime Database, click the **Rules** tab
6. Replace everything with this and click **Publish**:

```json
{
  "rules": {
    "game": {
      ".read": true,
      ".write": true,
      ".validate": "newData.isString() || newData.hasChildren()"
    }
  }
}
```

This keeps the database open for your app but adds basic validation.
If you want maximum security, come back after deploying and restrict by your Vercel domain.

7. Copy your database URL — looks like:
   `https://the-wager-default-rtdb.firebaseio.com`

---

## STEP 2 — Anthropic API Key (live match fetching)

1. Go to **https://console.anthropic.com** → sign in or create account
2. Click **API Keys → Create Key** → copy it (starts with `sk-ant-`)
3. Free credits on signup are plenty for the tournament

---

## STEP 3 — GitHub

1. Go to **https://github.com** → sign up free → click **+** → **New repository**
2. Name it `the-wager` → **Create repository**
3. Click **"uploading an existing file"**
4. Drag all files from inside the `wager` folder into the upload area
5. **Commit changes**

---

## STEP 4 — Vercel

1. Go to **https://vercel.com** → sign up with GitHub
2. **Add New Project** → find `the-wager` → **Import**
3. Expand **Environment Variables** and add ALL of these:

| Name | Value |
|------|-------|
| `VITE_FIREBASE_URL` | `https://YOUR-PROJECT-default-rtdb.firebaseio.com` |
| `ANTHROPIC_API_KEY` | `sk-ant-your-key-here` |
| `FIREBASE_URL` | same as VITE_FIREBASE_URL |
| `ALLOWED_ORIGIN` | `https://the-wager.vercel.app` (your URL — set this after first deploy) |

4. Click **Deploy** → ~1 minute → you get a URL like `the-wager.vercel.app` 🎉
5. Go back to Environment Variables, update `ALLOWED_ORIGIN` to your exact URL, then **Redeploy**

---

## STEP 5 — Share

Send everyone the link. They open it, enter their name, choose a PIN. Done.

**To add to home screen:**
- iPhone: Share → "Add to Home Screen"
- Android: three dots → "Add to Home Screen"

---

## How it works

- **First person to join** = permanent admin
- Admin can: fetch live results, add manual results, reset the game
- Everyone else controls only their own account
- **PIN** = how you log back in on a new device or if you clear your browser
- Data lives in Firebase — code updates via GitHub never touch it

## Updating the app

When you get updated files:
1. Go to GitHub → find the file → pencil icon → paste new code → Commit
2. Vercel auto-deploys in ~60 seconds

