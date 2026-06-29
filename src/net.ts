/**
 * Network helpers: the configured port and the machine's LAN addresses, so we
 * can tell the user a stable `http://<ip>:<port>` to reach from other devices.
 */
import { networkInterfaces, hostname } from "node:os";

export const DEFAULT_PORT = 1357;

/** Server port: `IREAL_PORT` env override, else the default. */
export function serverPort(): number {
  const env = process.env.IREAL_PORT;
  const n = env ? Number(env) : NaN;
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : DEFAULT_PORT;
}

/** Non-internal IPv4 addresses of this machine (best reachable LAN hosts). */
export function lanAddresses(): string[] {
  const out: string[] = [];
  const ifaces = networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] ?? []) {
      if (ni.family === "IPv4" && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

/** Candidate base URLs to reach the server, LAN addresses first. */
export function baseUrls(port = serverPort()): string[] {
  const urls = lanAddresses().map((ip) => `http://${ip}:${port}`);
  // Also offer the .local mDNS name and localhost as fallbacks.
  const host = hostname();
  const mdns = host.endsWith(".local") ? host : `${host}.local`;
  urls.push(`http://${mdns}:${port}`);
  urls.push(`http://localhost:${port}`);
  return urls;
}

/** The single best base URL to advertise (first LAN address, else localhost). */
export function primaryBaseUrl(port = serverPort()): string {
  const lan = lanAddresses();
  return lan.length ? `http://${lan[0]}:${port}` : `http://localhost:${port}`;
}
