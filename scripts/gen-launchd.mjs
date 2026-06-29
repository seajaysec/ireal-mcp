#!/usr/bin/env node
/**
 * Generate (and optionally install) a launchd LaunchAgent so the ireal-mcp HTTP
 * server starts on login and stays running (KeepAlive).
 *
 *   node scripts/gen-launchd.mjs            # print the plist
 *   node scripts/gen-launchd.mjs --install  # write it to ~/Library/LaunchAgents and load it
 *
 * Honors IREAL_PORT and IREAL_LIBRARY from the current environment (baked into
 * the plist). Safe to re-run; --install unloads any previous copy first.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const LABEL = "com.ireal-mcp.server";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serveJs = join(repoRoot, "dist", "serve.js");
const node = process.execPath;
const port = process.env.IREAL_PORT ?? "1357";
const library = process.env.IREAL_LIBRARY ?? join(homedir(), ".ireal-mcp", "charts");
const logDir = join(homedir(), ".ireal-mcp");

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${node}</string>
    <string>${serveJs}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>IREAL_PORT</key><string>${port}</string>
    <key>IREAL_LIBRARY</key><string>${library}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${join(logDir, "server.log")}</string>
  <key>StandardErrorPath</key><string>${join(logDir, "server.err.log")}</string>
  <key>WorkingDirectory</key><string>${repoRoot}</string>
</dict>
</plist>
`;

if (process.argv.includes("--install")) {
  mkdirSync(logDir, { recursive: true });
  const agentsDir = join(homedir(), "Library", "LaunchAgents");
  mkdirSync(agentsDir, { recursive: true });
  const plistPath = join(agentsDir, `${LABEL}.plist`);
  writeFileSync(plistPath, plist, "utf8");
  console.log(`Wrote ${plistPath}`);
  try {
    execFileSync("launchctl", ["unload", plistPath], { stdio: "ignore" });
  } catch {
    /* not previously loaded */
  }
  execFileSync("launchctl", ["load", plistPath], { stdio: "inherit" });
  console.log(`Loaded ${LABEL}. Server will run on port ${port} now and at every login.`);
  console.log(`Logs: ${join(logDir, "server.log")}`);
} else {
  process.stdout.write(plist);
  console.error(`\n(Use --install to write to ~/Library/LaunchAgents and load it. Port ${port}.)`);
}
