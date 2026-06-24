#!/usr/bin/env node
/**
 * NZ Gazette API Client
 *
 * Queries the New Zealand Gazette via the DigitalNZ API.
 * No API key required for basic use.
 *
 * Examples:
 *   node nz_gazette_client.js --query bankruptcy
 *   node nz_gazette_client.js --query "land transfer" --pages 3 --format csv
 *   node nz_gazette_client.js --notice-type "Land Notices" --date-from 2024-01-01
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const BASE_URL = "api.digitalnz.org";
const PRIMARY_COLLECTION = "New Zealand Gazette";

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    query: null,
    noticeType: null,
    dateFrom: null,
    dateTo: null,
    pages: 1,
    perPage: 20,
    apiKey: null,
    format: "json",
    output: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--query":
      case "-q":
        options.query = args[++i];
        break;
      case "--notice-type":
      case "-t":
        options.noticeType = args[++i];
        break;
      case "--date-from":
        options.dateFrom = args[++i];
        break;
      case "--date-to":
        options.dateTo = args[++i];
        break;
      case "--pages":
        options.pages = parseInt(args[++i], 10) || 1;
        break;
      case "--per-page":
        options.perPage = parseInt(args[++i], 10) || 20;
        break;
      case "--api-key":
        options.apiKey = args[++i];
        break;
      case "--format":
        options.format = args[++i];
        break;
      case "--output":
      case "-o":
        options.output = args[++i];
        break;
      default:
        if (arg.startsWith("-")) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
    }
  }
  return options;
}

function buildPath(options, page) {
  const params = new URLSearchParams();
  params.append("page", String(page));
  params.append("per_page", String(options.perPage));
  params.append("and[primary_collection]", PRIMARY_COLLECTION);

  if (options.apiKey) params.append("api_key", options.apiKey);
  if (options.query) params.append("text", options.query);
  if (options.noticeType) params.append("and[category]", options.noticeType);
  if (options.dateFrom) params.append("and[date][from]", options.dateFrom);
  if (options.dateTo) params.append("and[date][to]", options.dateTo);

  return `/records.json?${params.toString()}`;
}

function fetchPage(options, page) {
  return new Promise((resolve, reject) => {
    const requestPath = buildPath(options, page);
    const req = https.get(
      {
        hostname: BASE_URL,
        path: requestPath,
        headers: { "User-Agent": "nz-gazette-client/1.0" },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error(`Invalid JSON: ${e.message}`));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
  });
}

async function fetchNotices(options) {
  const allResults = [];
  for (let page = 1; page <= options.pages; page++) {
    try {
      const data = await fetchPage(options, page);
      const results = data?.search?.results || [];
      if (!results.length) break;
      allResults.push(...results);
      console.log(`Page ${page}: fetched ${results.length} notice(s). Total so far: ${allResults.length}`);
      if (page < options.pages) await sleep(500);
    } catch (e) {
      console.error(`Error fetching page ${page}:`, e.message);
      break;
    }
  }
  return allResults;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function saveJson(results, filename) {
  fs.writeFileSync(filename, JSON.stringify(results, null, 2), "utf8");
  console.log(`Saved ${results.length} notice(s) to ${filename}`);
}

function saveCsv(results, filename) {
  if (!results.length) {
    console.log("No results to save.");
    return;
  }

  const headers = ["id", "title", "description", "date", "publisher", "url", "category"];
  const escape = (str) => {
    if (str == null) return "";
    const s = String(str).replace(/"/g, '""');
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
  };

  const lines = [headers.join(",")];
  for (const r of results) {
    const category = Array.isArray(r.category) ? r.category.join("; ") : r.category || "";
    const row = [
      r.id,
      r.title,
      (r.description || "").slice(0, 500),
      r.date,
      r.display_content_partner,
      r.landing_url || r.source_url,
      category,
    ];
    lines.push(row.map(escape).join(","));
  }

  fs.writeFileSync(filename, lines.join("\n"), "utf8");
  console.log(`Saved ${results.length} notice(s) to ${filename}`);
}

async function main() {
  const options = parseArgs();

  if (!["json", "csv"].includes(options.format)) {
    console.error("--format must be json or csv");
    process.exit(1);
  }

  const timestamp = new Date().toISOString().replace(/[:T]/g, "_").split(".")[0];
  const defaultName = `nz_gazette_${options.query || "all"}_${timestamp}.${options.format}`.replace(/\s+/g, "_");
  const outputFile = options.output || defaultName;

  console.log("Fetching NZ Gazette notices...");
  const results = await fetchNotices(options);

  if (options.format === "json") {
    saveJson(results, outputFile);
  } else {
    saveCsv(results, outputFile);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
