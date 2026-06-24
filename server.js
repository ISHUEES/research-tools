#!/usr/bin/env node
/**
 * Kimi Research Dashboard Server
 *
 * Serves the AI dashboard and streams live tool status via Server-Sent Events.
 * Runs the NZ Gazette client on demand and returns results to the browser.
 *
 * Usage:
 *   node server.js
 *   node server.js --port 8080
 *
 * Then open http://localhost:3000
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const DEFAULT_PORT = 3000;
const CLIENT_PATH = path.join(__dirname, "nz_gazette_client.js");
const DASHBOARD_PATH = path.join(__dirname, "ai-dashboard.html");

const clients = new Set();

function parseArgs() {
  const args = process.argv.slice(2);
  let port = DEFAULT_PORT;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) {
      port = parseInt(args[++i], 10) || DEFAULT_PORT;
    }
  }
  return { port };
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    res.write(payload);
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
    });
  });
}

function serveDashboard(res) {
  fs.readFile(DASHBOARD_PATH, "utf8", (err, data) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Failed to load dashboard.");
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/html",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}

function handleEvents(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("\n");
  clients.add(res);

  broadcast("status", { state: "CONNECTED", progress: 100 });
  broadcast("tool", { name: "server", state: "ready", detail: "listening" });

  req.on("close", () => clients.delete(res));
}

async function handleGazetteSearch(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
    return;
  }

  const {
    query = "",
    noticeType = "",
    dateFrom = "",
    dateTo = "",
    pages = 1,
    perPage = 20,
    format = "json",
  } = body;

  const safeFormat = ["json", "csv"].includes(format) ? format : "json";
  const timestamp = Date.now();
  const outputFile = path.join(__dirname, `dashboard-run-${timestamp}.${safeFormat}`);

  const args = [
    CLIENT_PATH,
    "--output", outputFile,
    "--pages", String(pages),
    "--per-page", String(perPage),
    "--format", safeFormat,
  ];
  if (query) args.push("--query", query);
  if (noticeType) args.push("--notice-type", noticeType);
  if (dateFrom) args.push("--date-from", dateFrom);
  if (dateTo) args.push("--date-to", dateTo);

  broadcast("status", { state: "EXECUTING", progress: 10 });
  broadcast("tool", { name: "bash", state: "running", detail: "nz_gazette_client.js" });

  const child = spawn(process.execPath, args, { cwd: __dirname });
  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    stdout += text;
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      broadcast("log", { message: line });
      if (line.includes("Page") && line.includes("fetched")) {
        const match = line.match(/Total so far:\s*(\d+)/);
        const count = match ? parseInt(match[1], 10) : 0;
        broadcast("status", { state: "FETCHING", progress: Math.min(80, 20 + count) });
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderr += text;
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) broadcast("log", { message: `[stderr] ${line}` });
    }
  });

  child.on("close", (code) => {
    broadcast("tool", { name: "bash", state: "idle", detail: `exit ${code}` });

    if (code !== 0) {
      broadcast("status", { state: "ERROR", progress: 100 });
      broadcast("error", { message: stderr || `Process exited with code ${code}` });
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: stderr || "Search failed" }));
      return;
    }

    fs.readFile(outputFile, "utf8", (err, data) => {
      if (err) {
        broadcast("status", { state: "ERROR", progress: 100 });
        broadcast("error", { message: `Could not read ${outputFile}` });
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Output file not found" }));
        return;
      }

      let payload;
      try {
        payload = safeFormat === "json" ? JSON.parse(data) : data;
      } catch (e) {
        payload = data;
      }

      broadcast("status", { state: "COMPLETE", progress: 100 });
      broadcast("complete", {
        format: safeFormat,
        file: outputFile,
        count: Array.isArray(payload) ? payload.length : null,
        data: payload,
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        format: safeFormat,
        file: outputFile,
        count: Array.isArray(payload) ? payload.length : null,
      }));

      // Clean up dashboard-run files older than 5 minutes asynchronously
      cleanupOldRuns();
    });
  });
}

function cleanupOldRuns() {
  fs.readdir(__dirname, (err, files) => {
    if (err) return;
    const now = Date.now();
    for (const file of files) {
      const match = file.match(/^dashboard-run-(\d+)\.(json|csv)$/);
      if (!match) continue;
      const fileTime = parseInt(match[1], 10);
      if (now - fileTime > 5 * 60 * 1000) {
        fs.unlink(path.join(__dirname, file), () => {});
      }
    }
  });
}

function handleNotFound(res) {
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}

const server = http.createServer((req, res) => {
  // Basic CORS headers for local development
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/" && req.method === "GET") {
    serveDashboard(res);
  } else if (url.pathname === "/events" && req.method === "GET") {
    handleEvents(req, res);
  } else if (url.pathname === "/api/gazette/search" && req.method === "POST") {
    handleGazetteSearch(req, res);
  } else {
    handleNotFound(res);
  }
});

const { port } = parseArgs();
server.listen(port, () => {
  console.log(`Dashboard server running at http://localhost:${port}`);
  console.log("Press Ctrl+C to stop.");
});
