# ireal-mcp

Builds **piano-friendly [iReal Pro](https://www.irealpro.com/) chord charts** — laid out at a fixed **4 measures per line**, the way a player reads them off the stand. It produces a tappable `irealb://` import link, a standalone HTML chart, a harmonic analysis (Roman numerals + chord-scales + jam plan), and an ASCII layout preview.

## Just want to make charts? (no install)

Open **`ireal-studio.html`** in any web browser (double-click it). Type a song, press **Make chart**, and tap **Open in iReal Pro** on your phone/iPad. It's one self-contained file — works offline, nothing to install, no server, your charts never leave the page.

> Don't have the file yet? Run `npm run build:web` once (or double-click `setup.command` on a Mac) to produce `dist-web/ireal-studio.html`, then share/keep that single file.

The rest of this README is for the **Claude (MCP) integration** and the optional **always-on LAN server** — power-user routes. On a Mac you can just double-click **`setup.command`**, which installs everything and prints exactly what to paste into Claude.

## Why "4 measures per line"?

iReal Pro lays a chart out as a grid of **16 cells per line**; a chord or a space takes one cell, while barlines, time signatures, rehearsal marks and staff text are free. Left alone, the app packs measures of differing widths and the line breaks wander.

This server makes the layout deterministic: **every measure is padded to exactly `16 / measuresPerLine` cells** (4 cells with the default 4 measures/line), so the app always wraps where you expect. The result reads like a clean fake-book page. You can change the density with `measuresPerLine` (must divide 16: `1, 2, 4, 8, 16`).

## Install the MCP server (Mac / Windows / Linux, any MCP client)

The server is plain Node + stdio + the official MCP SDK, so it runs anywhere Node runs and works with any MCP client that supports stdio servers (Claude Code, Claude Desktop, Cursor, Windsurf, …).

**Once published to npm** (see "Publishing" below), no clone or build is needed — point any client at `npx`. This config is identical on every OS:

```json
{
  "mcpServers": {
    "ireal": { "command": "npx", "args": ["-y", "ireal-mcp"] }
  }
}
```

Claude Code: `claude mcp add ireal -- npx -y ireal-mcp` (the `--` is required so the flags go to npx, not to `claude`).

**From source** (until it's on npm) — same on all three OSes:

```bash
git clone <repo> && cd ireal-mcp
npm install            # runs the build automatically (prepare script)
```

Then point your client at the absolute path:

```json
{ "mcpServers": { "ireal": { "command": "node", "args": ["/abs/path/ireal-mcp/dist/index.js"] } } }
```

Or via the CLI (note the `--` before the command): `claude mcp add ireal -- node /abs/path/ireal-mcp/dist/index.js`

> **Mac shortcut:** double-click `setup.command` — it installs, builds, and prints the exact config. (Windows/Linux: use the `git clone` steps above; a one-click installer for those is a TODO. The optional always-on LAN server's auto-start is currently Mac-only via launchd — on Windows/Linux run `npm run serve` manually, or wire it to Task Scheduler / systemd.)

## Publishing (to enable `npx` install everywhere)

`npm publish` ships the built `dist/` (the `prepare` script builds it; `prepublishOnly` runs typecheck + tests first). After that, anyone on any OS installs via the `npx` config above — no clone, no build.

## Serve over your network

The companion HTTP server makes every saved chart reachable from other devices
(your iPad/phone with iReal Pro) at a **stable address**:

```bash
npm run serve          # binds 0.0.0.0:1357, prints the LAN URLs to use
```

It reads the chart **library** on disk per request, so charts the MCP tools save
appear immediately. On startup it prints something like:

```
ireal-mcp HTTP server listening on port 1357
Reachable at:
  http://192.168.68.73:1357
  http://your-mac.local:1357
```

Open that URL on a device with iReal Pro and tap **import** to load a chart.

| Route | Purpose |
|-------|---------|
| `/` | Index of every chart + "open all as one iReal Pro playlist" |
| `/chart/<slug>` | View a chart (layout preview + import button) |
| `/import/<slug>` | Redirects straight to the `irealb://` import (tap to import) |
| `/playlist` | Redirects to an `irealb://` playlist of the whole library |

**Config** (env vars): `IREAL_PORT` (default `1357`), `IREAL_LIBRARY` (default
`~/.ireal-mcp/charts`).

### Keep it running (auto-start on login)

```bash
npm run install-service   # writes & loads a launchd LaunchAgent (macOS)
```

This installs `~/Library/LaunchAgents/com.ireal-mcp.server.plist` with
`KeepAlive` so the server starts at login and restarts if it dies. Logs go to
`~/.ireal-mcp/server.log`. To preview the plist without installing:
`node scripts/gen-launchd.mjs`. To remove:
`launchctl unload ~/Library/LaunchAgents/com.ireal-mcp.server.plist`.

## Configure your MCP client

Add to your client config (Claude Desktop / Claude Code `.mcp.json`, etc.):

```json
{
  "mcpServers": {
    "ireal": {
      "command": "node",
      "args": ["/absolute/path/to/ireal-mcp/dist/index.js"]
    }
  }
}
```

Or run directly with `npx ireal-mcp` once published.

## Tools

| Tool | What it does |
|------|--------------|
| **`create_chart`** | Build a chart from structured `measures` (or a `raw` progression). **Saves to the library and serves it over HTTP by default** (`save: false` to skip; `slug` to control the URL). Returns the modern `irealb://` link, legacy link, the served URLs, ASCII preview, raw progression, and warnings. `outputHtmlPath` also writes a standalone HTML copy anywhere. |
| **`preview_chart`** | ASCII layout grid only — fast iteration while writing chords (no save). |
| **`list_charts`** | List saved charts with their slugs and served URLs. |
| **`delete_chart`** | Remove a chart from the library by slug. |
| **`server_info`** | Report the library path, port, and LAN URLs where the server is reachable, plus the start command. |
| **`decode_chart`** | Parse an existing `irealb://`/`irealbook://` URL (or HTML containing one) back into title/composer/style/key + a measure list, for editing. |
| **`list_styles`** | The built-in iReal Pro styles (Jazz / Latin / Pop). |
| **`list_chord_qualities`** | Valid chord roots, qualities, keys, and time signatures, so generated charts use legal symbols. |

## Input model

A chart is `title` + optional `composer`/`style`/`key`/`bpm`/`timeSignature`/`measuresPerLine`, plus either:

- **`measures`** (preferred): an array where each measure is `{ chords: ["A-7","D7"], section?, open?, close?, ending?, staffText?, noChord?, ... }`. The server owns the layout and encoding.
- **`raw`**: a raw iReal Pro progression string, used verbatim (power users).

### Example

A 12-bar B♭ blues:

```json
{
  "title": "Blues for Probe",
  "composer": "Chris Farrell",
  "style": "Medium Swing",
  "key": "Bb",
  "measures": [
    {"chords": ["Bb7"]}, {"chords": ["Eb7"]}, {"chords": ["Bb7"]}, {"chords": ["Bb7"]},
    {"chords": ["Eb7"]}, {"chords": ["Eb7"]}, {"chords": ["Bb7"]}, {"chords": ["G7"]},
    {"chords": ["C-7"]}, {"chords": ["F7"]}, {"chords": ["Bb7","G7"]}, {"chords": ["C-7","F7"]}
  ]
}
```

Produces:

```
| Bb7      | Eb7      | Bb7      | Bb7      |
| Eb7      | Eb7      | Bb7      | G7       |
| C-7      | F7       | Bb7  G7  | C-7  F7  |
```

### Chord syntax

Root + quality + optional `/bass`: `C`, `C-7`, `C^7`, `C7b9`, `C-7/Bb`. Alternate chords in parentheses: `(Db^7)`. No chord: use `"noChord": true`. Custom/free-text qualities: wrap in asterisks, e.g. `C*lyd*`. Call `list_chord_qualities` for the full vocabulary.

### Sections, repeats, endings

```json
{"chords": ["C^7"], "section": "A", "open": "{"}   // start an A section + repeat
{"chords": ["G7"], "ending": 1, "close": "}"}      // first ending, close repeat
{"chords": ["G7"], "staffText": "D.C. al Coda", "coda": true}
```

## How it works

- **`obfuscate.ts`** — port of the `irealb://` scrambling (magic prefix `1r34LbKcu7` + literal substitutions + the symmetric 50-byte "hussle"). Verified against the published reference vector and round-tripped.
- **`layout.ts`** — distributes each measure's chords across the fixed cell budget (1/2/4 chords map cleanly; dense measures comma-pack at small size) and assembles the progression with barlines, sections, time signatures and endings.
- **`url.ts`** — builds and parses both URL schemes (10-field modern, 6-field legacy), composer/title sort-ordering, percent-encoding.
- **`render.ts`** — ASCII grid + standalone HTML.

## Development

```bash
npm test         # vitest: obfuscation vectors, layout cell-counts, URL round-trips
npm run typecheck
npm run dev      # run from source with tsx
```

## Credits

Format details from the iReal Pro custom-URL protocol and the reference
implementations under `docs/` (pyrealpro, `Data::iRealPro`, musicxml-irealpro).

## License

MIT
