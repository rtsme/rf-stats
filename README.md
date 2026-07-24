# rf-stats

Public stats dashboard for the RF Activity Discord bot — Player of the Month,
leaderboards, and population / chip-win trends.

**This repo is published automatically.** The `data/*.json` files are generated on the
server by the bot's `webexport.py` (which lives in a separate private repo) and pushed
here; the page reads them client-side. Don't hand-edit `data/` — it gets overwritten.

Served via GitHub Pages (Settings → Pages → Deploy from a branch → `main` / root):
**https://rtsme.github.io/rf-stats/**

```
index.html   page shell + tabs
style.css    dark theme
app.js       fetches data/*.json, renders with Chart.js (CDN)
data/        auto-generated stats snapshots
```
