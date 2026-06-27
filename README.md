# Ordoly Wall Card — Home Assistant Lovelace card

Show one Ordoly **wall** — a per-group wall or a custom wall — as an element on
your own Home Assistant dashboard. It looks and behaves exactly like the wall in
the Ordoly app: each member gets a column, you can **check tasks done/undone**,
**request a skip**, open **task info**, browse **badges**, and browse + **buy
shop items** — all live, updating the moment something changes on a phone.

It is **read-and-write but account-free**. The card never asks for your Ordoly
login. Instead you generate a **username + password + key** in the app, scoped to
one wall you administer, and the card talks only to that wall.

## 1. Generate credentials in the Ordoly app

1. Open the Ordoly app → **Settings → Home Assistant wall**.
2. Tap **Add a Home Assistant card**, pick a wall you administer (a group where
   you're an admin, or a custom wall you own), and tap **Generate credentials**.
3. Copy the **Server URL**, **Username**, **Password** and **Key** shown. They're
   shown only once — use **Copy all for Home Assistant** to grab them together.

You can revoke a credential any time from the same screen; the card stops working
immediately.

## 2. Install the card in Home Assistant

### Option A — HACS (recommended)

1. In HACS, open the three-dot menu → **Custom repositories**.
2. Add this repository's URL with category **Dashboard** (Lovelace plugin).
3. Install **Ordoly Wall Card**, then reload your browser.

### Option B — Manual

1. Copy `ordoly-wall-card.js` into your Home Assistant `config/www/` folder.
2. Go to **Settings → Dashboards → ⋮ → Resources → Add resource**.
   - URL: `/local/ordoly-wall-card.js`
   - Type: **JavaScript module**
3. Reload your browser.

## 3. Add the card to a dashboard

1. Edit a dashboard → **Add card** → search **Ordoly Wall** (or add a manual card
   with `type: custom:ordoly-wall-card`).
2. Fill in the visual editor (or YAML):

```yaml
type: custom:ordoly-wall-card
base_url: http://homeassistant.local:3000   # your Ordoly backend
username: wall_xxxxxxxxxxxx
password: "<the password from the app>"
key: "<the key from the app>"
title: Kitchen wall        # optional — overrides the wall's own name
height: 62vh               # optional — height of each member's task column
```

3. Save. The wall appears and stays live.

## Network notes

- `base_url` is your **Ordoly backend** (the API on port 3000 by default), not
  Home Assistant. Use the LAN IP or a reverse-proxied HTTPS URL the browser
  rendering the dashboard can reach. The browser (not the HA server) makes the
  requests, so the address must resolve from the device viewing the dashboard.
- If your Ordoly backend runs behind an app key (`APP_SECRET`), you do **not**
  need it here — `/ha-wall/*` is authenticated entirely by the credential.

## What it does *not* do

- It can't manage members, edit wall settings, or accept custom-wall invites —
  do those in the app.
- The exit-lock (`lock_enabled`) is advisory here; the credential already gates
  the whole wall, and a dashboard card isn't a fullscreen kiosk.

## How it works

```
Dashboard card ──POST /ha-wall/session {username,password,key}──▶ Ordoly backend
   (custom:ordoly-wall-card)        ← short wall-scoped token + SSE token
        ├── GET  /ha-wall/data                  render the wall
        ├── POST/DELETE /ha-wall/complete        check / uncheck a task
        ├── POST /ha-wall/skip                   request a skip
        ├── GET  /ha-wall/shop  + /shop/purchase browse + buy (as the column member)
        ├── GET  /ha-wall/badges                 badges + ranking
        └── GET  /ha-wall/stream?token=…         live updates (SSE)
```

Everything is bound to the one wall the credential was generated for; a leaked
credential can reach nothing else.
