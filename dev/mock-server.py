#!/usr/bin/env python3
"""Serve the landing page locally with fake Healthchecks responses.

Lets you work on the page without Caddy, API keys, or a reachable Healthchecks
instance.

    python3 dev/mock-server.py
    # -> http://127.0.0.1:8791

Check fixtures are derived from your config at request time (config.json if you
have one, otherwise config.example.json) rather than hardcoded, for two reasons:
it works against whatever services you have configured, and it keeps this file
free of any record of your actual setup.

Standard library only — no pip install needed.

Statuses are assigned from a fixed rotation so that every state the dashboard
can render — up, down, late, paused, never-pinged — shows up somewhere without
you having to wait for one to happen for real. Two unmapped checks are added
per source to exercise the "Unmapped checks" section.

Nothing here ships to the server; it exists purely for local iteration.
"""

import datetime
import http.server
import json
import os
import pathlib
import re
import sys

PORT = 8791
ROOT = pathlib.Path(__file__).resolve().parent.parent

# Mostly up, with each of the interesting states appearing at least once.
STATUS_CYCLE = [
    "up", "up", "up", "down", "up", "up", "grace",
    "up", "up", "paused", "up", "up", "new", "up",
]


def real_items(seq):
    """Drop comment-only entries — keys starting with "_" are documentation."""
    return [x for x in (seq or [])
            if isinstance(x, dict) and any(not k.startswith("_") for k in x)]


def slugify(s):
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", s.lower()))


def ago(minutes):
    t = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=minutes)
    return t.isoformat().replace("+00:00", "Z")


def make_check(slug, status, minutes):
    return {
        "name": slug.replace("-", " ").title(),
        "slug": slug,
        "tags": "",
        "desc": "",
        "status": status,
        "n_pings": 0 if status == "new" else 400,
        "grace": 3600,
        "timeout": 86400,
        # A check that has never pinged genuinely has no last_ping; the
        # dashboard renders that case differently from an unmonitored service.
        "last_ping": None if status == "new" else ago(minutes),
        "next_ping": ago(-60),
        "unique_key": slug + "-key",
    }


def config_path():
    for name in ("config.json", "config.example.json"):
        p = ROOT / name
        if p.exists():
            return p
    return None


def build_fixtures():
    """Return {source_key: [check, ...]} derived from the config file."""
    path = config_path()
    if path is None:
        return {}

    try:
        cfg = json.loads(path.read_text())
    except json.JSONDecodeError as err:
        # The page itself reports parse errors properly; here just don't crash.
        print(f"! {path.name} did not parse: {err}", file=sys.stderr)
        return {}

    # However many instances are configured, under whatever names.
    keys = [k for k in (cfg.get("sources") or {}) if not k.startswith("_")]
    fixtures = {k: [] for k in keys}
    default_key = cfg.get("defaultSource") or (keys[0] if keys else "local")

    i = 0
    for group in real_items(cfg.get("groups")):
        for svc in real_items(group.get("services")):
            if "check" in svc and svc["check"] is None:
                continue  # explicitly opted out of monitoring

            slug = svc.get("check") or slugify(str(svc.get("name", "")))
            if not slug:
                continue

            key = svc.get("source", default_key)
            fixtures.setdefault(key, [])

            status = STATUS_CYCLE[i % len(STATUS_CYCLE)]
            fixtures[key].append(make_check(slug, status, minutes=(i * 7) % 240 + 1))
            i += 1

    # Checks no tile claims, so the "Unmapped checks" section has something.
    if keys:
        fixtures[keys[0]] += [make_check("apt-updates", "grace", 1500)]
        fixtures[keys[-1]] += [make_check("router-reboot-watch", "up", 900)]

    return fixtures


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?")[0]
        match = re.fullmatch(r"/api/hc/([a-z0-9_-]+)/checks/", path)
        if not match:
            return super().do_GET()

        checks = build_fixtures().get(match.group(1), [])
        body = json.dumps({"checks": checks}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        # Without this the browser caches app.js/styles.css and your edits
        # appear not to have taken effect.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    os.chdir(ROOT)
    src = config_path()
    print(f"config:       {src.name if src else 'none found'}")
    print(f"landing page: http://127.0.0.1:{PORT}   (ctrl-c to stop)")
    try:
        http.server.HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        pass
