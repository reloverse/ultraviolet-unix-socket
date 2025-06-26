/**
 * @typedef {import("http").ServerResponse} ServerResponse
 * @typedef {import("http").IncomingMessage} IncomingMessage
 */
import { createServer, IncomingMessage } from "http";
import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { join, normalize, resolve, sep } from "path";
import { hostname } from "os";
import { stat } from "fs/promises";
import { createReadStream } from "fs";
import { lookup as getMimeType } from "mime-types";
import wisp from "wisp-server-node";
import { URL } from "url";

/**
 * reolve path w/o directory traversal
 * @param {string} base - base directory to constrain access within.
 * @param {string} target - relative path to resolve.
 * @returns {string|null} - absolute safe path, or null if invalid
 */
function safeJoin(base, target) {
  const targetPath = resolve(base, "." + normalize("/" + target));
  if (!targetPath.startsWith(base + sep) && targetPath !== base) return null;
  return targetPath;
}

/**
 * serve static file
 * @param {ServerResponse} res - response
 * @param {string} filePath - path to file
 */
async function serveStatic(res, filePath) {
  try {
    await stat(filePath);
    const stream = createReadStream(filePath);
    const mime = getMimeType(filePath) || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    stream.pipe(res);
  } catch {
    res.statusCode = 404;
    res.end();
  }
}

/**
 * Helper to serve from a base directory with path prefix.
 * @param {ServerResponse} res - http response object.
 * @param {string} base - root directory.
 * @param {string} subPath - path relative to root.
 */
function routeFromBase(res, base, subPath) {
  const safePath = safeJoin(base, subPath);
  if (safePath) return serveStatic(res, safePath);
  res.statusCode = 403;
  res.end();
}

/**
 * Handle incoming HTTP requests and route them to the correct static root.
 * @param {IncomingMessage} req - HTTP request object.
 * @param {ServerResponse} res - HTTP response object.
 */
function routeRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");

  if (path.startsWith("/uv/")) return routeFromBase(res, uvPath, path.slice(4));
  if (path.startsWith("/epoxy/")) return routeFromBase(res, epoxyPath, path.slice(7));
  if (path.startsWith("/baremux/")) return routeFromBase(res, baremuxPath, path.slice(9));
  res.statusCode = 404;
  res.end();
}

const server = createServer(routeRequest);

server.on("upgrade", (req, socket, head) => {
  if (req.url.endsWith("/wisp/")) wisp.routeRequest(req, socket, head);
  else socket.end();
});

const port = parseInt(process.env.PORT || "8080", 10);

server.listen(port, () => {
  const { address, port, family } = server.address();
  const host = family === "IPv6" ? `[${address}]` : address;
  console.log(`Serving on http://${host}:${port}`);
});

["SIGINT", "SIGTERM"].forEach(signal =>
  process.on(signal, () => {
    server.close();
    process.exit(0)
  })
);