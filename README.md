# Home lab landing page

A static launcher for your Proxmox services that doubles as a status board.
Tiles link to each service and are coloured by what Healthchecks says about it.

No build step, no runtime, no database — static files plus a Caddy route.

```
index.html            page shell
config.example.json   template — copy to config.json
config.json           ← the only file you normally edit (gitignored)
assets/app.js         rendering + Healthchecks polling
assets/styles.css     theme
Caddyfile.snippet     template for the Caddy routes
dev/mock-server.py    local preview with fake status data (not deployed)
```

## Config reference

`config.json` is fetched at page load and parsed by the browser natively —
no build step, no libraries, no dependencies. Edit, save, reload.

**Comments:** JSON has no comment syntax, so by convention **any key starting
with `_` is documentation and is ignored** — `_comment`, `_note`, `_todo`,
whatever you like. This is enforced, not just assumed: a comment-only object in
`groups` or `services` is skipped rather than rendered as a blank tile, and a
`_comment` key inside `sources` is skipped rather than fetched as a real
Healthchecks instance.

```json
"sources": {
  "_comment": "endpoint points at the Caddy routes, never at healthchecks.io",
  "local": { "label": "Local", "endpoint": "/api/hc/local/checks/" }
}
```

The template ships with a `_comment` header plus `_fields` and `_icons` blocks,
so the docs travel with the file. It is deliberately over-stuffed — 91 services
across 13 groups covering a fairly complete homelab — so that setting up is
mostly *deleting* the things you don't run. The same reference follows.

**Top level**

| Key | |
|---|---|
| `title` | Page heading and browser tab title. |
| `refreshSeconds` | How often to re-poll Healthchecks. Minimum 10. |
| `sources` | Your Healthchecks instances, keyed by name — **any number of them**. Each has a `label` and an `endpoint` pointing at a Caddy route, never at healthchecks.io directly, or the API key would have to live in the browser. |
| `defaultSource` | Which instance a service uses when it doesn't name one. Optional; defaults to the first entry in `sources`. |
| `groups` | Array of `{ name, services }`. Each becomes a headed section. |

**Per service** — only `name` and `url` are required

| Key | |
|---|---|
| `name` | Display name. |
| `url` | Where the tile links to. Opens in a new tab. |
| `desc` | Small grey line under the name. Falls back to the hostname. |
| `check` | Healthchecks **slug**. Omit to use a slugified `name` (`Home Assistant` → `home-assistant`). Use `null` to opt out of monitoring — the tile becomes a plain link. |
| `source` | Which instance owns the check — any key from `sources`. Defaults to `defaultSource`. |
| `icon` | A built-in icon name, or an image path/URL (anything containing `/` or `.`). Falls back to a coloured monogram. |
| `color` | Tile colour, any CSS colour. Defaults to one derived from the name. Ignored for image icons unless `plate` is set — a logo carries its own colour. |
| `plate` | Image icons sit on a bare plate by default. Set `true` to put the `color` fill back behind one. Needed for pale marks, and for logos that carry their own light circular ground, which otherwise lose their edge against the light theme. |
| `tags` | Extra words the filter box should match on. |

If the file doesn't parse, the page names the line and column rather than
rendering an empty board. The usual culprit is a trailing comma — or a `//`
comment, which JSON does not allow; use a `_` key instead.

**Built-in icons** — 44 inline SVGs, no icon CDN

```
media    tv, film, music, book, captions, play, request, download, chart, search
infra    server, proxy, containers, shield, pulse, globe, network, wifi, link
data     database, gauge, cpu, disk, clock, bell
dev      workflow, terminal, git, bot, flask, camera
home     home, cloud, photo, lock, document, archive
office   wiki, tasks, calendar, mail, key, rss, utensils
```

**App logos** — `assets/logos/` holds 76 SVG marks, 74 of them vendored from
[homarr-labs/dashboard-icons](https://github.com/homarr-labs/dashboard-icons),
referenced as `"icon": "assets/logos/<name>.svg"`. They are committed rather
than hotlinked for the same reason the glyphs are inline: the dashboard has to
render with the internet down. To add one, drop the SVG in that directory and
point `icon` at it.

Two are drawn here rather than vendored, because upstream has no usable mark:

- `calibre-web-downloader.svg` — `calibre-web.svg` with a download badge. The
  arrow inside that badge is a hole rather than a fill: logos render in an
  `<img>`, so `currentColor` does not inherit and any fixed arrow colour would
  fail on one of the two themes. Letting the tile show through keeps it legible
  on both.
- `filaman.svg` — upstream ships FilaMan as a PNG only, and its logo is a spool
  behind a `FilaMan` wordmark that is unreadable at the 30px a tile icon
  renders at. This keeps the spool and drops the words. Its outer edge is the
  gold of the flange rather than the black of the original, which would lose
  its edge against the dark theme.

A logo sits on a bare plate, since most carry their own colour and circular
ground. Marks that are pale, or that ship a light ground, lose their edge
against the light theme — those set `plate: true` and a dark `color`. Seven do
today: Sonarr, Bazarr, Autobrr, BookStack, Dockge, Healthchecks and Uptime Kuma.

Entries with no honest match in the pack keep a built-in glyph: Unpackerr,
Scrypted and Speedtest, plus everything under Scheduled Jobs and Offsite, which
are cron jobs and heartbeats rather than apps.

## Multiple Healthchecks instances

The dashboard reads from as many instances as you like. Each one needs three
things lined up by the same key:

| | |
|---|---|
| `config.json` | an entry under `sources`, e.g. `"vps"` |
| `Caddyfile` | a route at `/api/hc/vps/checks/` |
| systemd | an env var the route reads, e.g. `HC_VPS_KEY` |

A service then picks its instance with `"source": "vps"`. The shipped template
wires up three — `local`, `cloud`, and `vps` — which is also the pattern for
adding a fourth: copy a Caddy block, change the key in the path, point it at a
new environment variable.

This matters because the instances watch different things. A local instance
can't tell you the house has gone offline; that check belongs somewhere else.


## What stays out of git

No credentials live in this repo — the Healthchecks API keys are read from
Caddy's systemd environment. What *is* sensitive is deployment detail: an
inventory of every service you run and the hostname each answers on. That's a
map of your network, so it stays untracked:

| | |
|---|---|
| `config.json` | Your real services and hostnames. **Gitignored.** Copy `config.example.json` and edit. |
| `Caddyfile.snippet` | Tracked, but as a *template*. Values marked `CHANGE ME` are generic; your edited copy belongs on the Caddy host. |
| `dev/mock-server.py` | Derives its fixtures from your config at runtime, so it holds no service list of its own. |

This repo is public, so that separation is doing real work: the tracked files
describe how the dashboard works, and none of them say anything about what runs
on your network or where.

## Working on it locally

```bash
python3 dev/mock-server.py   # http://127.0.0.1:8791
```

Standard library only — no pip install. Serves the page with fake Healthchecks
responses, so you can iterate without Caddy, API keys, or a reachable
Healthchecks instance. The fixtures cover every
status the dashboard renders — including a down check, a late one, one that has
never pinged, and two unmapped checks — so you can see each state without
waiting for one to happen for real.

## How the status gets in

The page is static, so it cannot call the Healthchecks API directly:

- the API needs a key, and a static page can only hold one by shipping it to
  every browser that loads the page, and
- the browser would be blocked by CORS anyway.

So Caddy makes the call instead. The page fetches its own origin
(`/api/hc/local/checks/`), Caddy proxies that to Healthchecks and injects the
API key server-side. The key never leaves the server.

```
browser ──GET /api/hc/local/checks/──► Caddy ──+ X-Api-Key──► Healthchecks
```

## Setup

**1. Copy the files** to wherever Caddy will serve them:

```bash
rsync -av --exclude Caddyfile.snippet --exclude README.md ./ root@caddy-host:/srv/landing-page/
```

**2. Get a read-only API key per instance.** In each Healthchecks project: *Settings →
API keys → API key (read-only)*. Read-only is what you want — it can list
checks and nothing else, so a leak can't pause a check or delete anything.

**3. Give Caddy the keys.** They're read from the environment, so they stay out
of your Caddyfile and out of version control. For a systemd-managed Caddy:

```bash
sudo systemctl edit caddy
```

```ini
[Service]
Environment="HC_LOCAL_KEY=your-self-hosted-readonly-key"
Environment="HC_CLOUD_KEY=your-healthchecks-io-readonly-key"
Environment="HC_VPS_KEY=your-vps-instance-readonly-key"
```

One variable per instance. Drop the ones you don't use, and delete their Caddy
blocks too.

**4. Merge `Caddyfile.snippet`** into your Caddyfile. Change the site address,
the `root` path, and the local Healthchecks upstream address, then:

```bash
sudo systemctl daemon-reload && sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl restart caddy
```

Restart, not reload — a reload will not pick up new environment variables.

**5. Create your config** and fill in your real URLs and check slugs. Reload
the page; there is nothing to rebuild.

```bash
cp config.example.json config.json
```

## Wiring a tile to a check

A tile finds its check by **slug**. By default it uses the slugified service
name, so a service named `Home Assistant` looks for the slug `home-assistant`.
When they differ, say so explicitly:

```json
{ "name": "AdGuard", "url": "http://adguard.example.com", "check": "adguard-home" }
```

- `source: "cloud"` looks the check up in the cloud instance instead of local.
- `check: null` opts the tile out of monitoring — it becomes a plain link.
- Anything reporting to Healthchecks that no tile claims shows up under
  **Unmapped checks** at the bottom, so a check you added on the server but
  forgot to wire up here doesn't quietly go unwatched.

Statuses come straight from Healthchecks: `up`, `down`, `grace` (shown as
"late"), `paused`, and `new` ("no pings").

## Notes

- **Icons** are inline SVG, listed above and in `config.example.json`. They're inline
  rather than loaded from an icon CDN so the page still renders when the
  internet is down — which is exactly when you'll be looking at it. Point
  `icon` at a path or URL instead if you'd rather use your own image.
- **One key per project.** A Healthchecks API key is scoped to a single
  project. To pull from more projects, add another `sources` entry and another
  Caddy route.
- **The proxy is pinned** to the single read-only `/checks/` endpoint on
  purpose. A wildcard there would turn Caddy into an open, authenticated proxy
  to the whole Healthchecks API for anyone who can load the page.
- **Plain HTTP.** The site block carries an explicit `http://` scheme on
  purpose. Without it, Caddy switches on automatic HTTPS and tries to provision
  a certificate — which fails for an internal-only hostname, since no public CA
  will issue for a name it can't reach. If you later want TLS, drop the scheme
  and add `tls internal`, then trust Caddy's root CA on your devices.
- **Tiles open in a new tab**, so the dashboard stays put as you jump around.
- Auto-refreshes every 60s (`refreshSeconds`), skips polling while the tab is
  hidden, and refreshes immediately when you come back to it.
- Press `/` to filter, `Esc` to clear.
