# Shopify Monitor

Monitors Shopify products for stock & price changes and sends Discord alerts — runs in GitHub Actions 24/7, even when your PC is off. **Free.**

---

## Setup (5 minutes)

### Step 1 — Create a GitHub repo

1. Go to [github.com](https://github.com) and sign in
2. Click the **+** button → **New repository**
3. Name it `shopify-monitor`
4. Set it to **Private** (recommended)
5. Click **Create repository**

---

### Step 2 — Upload the files

Upload all these files into your new repo (drag & drop them onto the repo page):

```
shopify-monitor/
├── .github/
│   └── workflows/
│       └── monitor.yml
├── monitor.js
├── products.json
└── README.md
```

> **Important:** The `.github/workflows/` folder must be created exactly like that. GitHub needs it to find the workflow.

---

### Step 3 — Add your Discord webhook secret

1. In your repo, go to **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `DISCORD_WEBHOOK`
4. Value: your Discord webhook URL (e.g. `https://discord.com/api/webhooks/...`)
5. Click **Add secret**

---

### Step 4 — Edit products.json

Open `products.json` in your repo and add the products you want to monitor:

```json
[
  {
    "name": "Hot Wheels RX-7 Fast & Furious",
    "url": "https://www.jcardiecast.com/products/hot-wheels-2026-fast-furious-25th-anniversary-95-mazda-rx-7"
  },
  {
    "name": "Another Product",
    "url": "https://somestore.myshopify.com/products/some-item"
  }
]
```

- `name` — what you want to call it in Discord alerts
- `url` — the product page URL (tracking params like `?_kx=...` are stripped automatically)

---

### Step 5 — Enable the workflow

GitHub disables scheduled workflows on new repos by default.

1. Go to the **Actions** tab in your repo
2. Click the **"Shopify Monitor"** workflow
3. Click **"Enable workflow"** if prompted
4. Click **"Run workflow"** → **"Run workflow"** to do a manual first run

---

## Checking it works

- Go to **Actions** tab — you should see runs every minute
- Click any run to see the log output
- You'll see lines like:
  ```
  Checking: Hot Wheels RX-7 Fast & Furious
    First check — out of stock | $25.00 [via page]
  ```
- When something changes, Discord gets pinged automatically

---

## Adding / removing products

Just edit `products.json` directly on GitHub (click the file → pencil icon → edit → commit). Changes take effect on the next run (within 1 minute).

---

## Notes

- GitHub Actions gives you **2,000 free minutes/month**. Running every minute = ~43,800 runs/month. Each run takes ~10–15 seconds, so you use roughly **7,300–11,000 minutes/month** — this exceeds the free tier for private repos.
- **Fix:** Set the cron to `*/2 * * * *` (every 2 minutes) to stay within the free limit, or make the repo **public** (public repos get unlimited free Actions minutes).
- State is saved in `state.json` — this is how the monitor remembers previous stock/price between runs.
