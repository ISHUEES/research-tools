#!/usr/bin/env node
/**
 * Web Research Helper
 *
 * Fetches a webpage and extracts useful information for research.
 * Saves output as Markdown or JSON.
 *
 * Be respectful: check robots.txt, don't hammer servers, and only scrape
 * public data you have permission to use.
 *
 * Examples:
 *   node web_research_helper.js https://example.com/article
 *   node web_research_helper.js https://example.com/listings --extract-links --output research.md
 *   node web_research_helper.js https://example.com --extract-emails --output contacts.json
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const { URL } = require("url");

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    url: null,
    output: null,
    format: "markdown",
    extractLinks: false,
    extractEmails: false,
    extractPhones: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      options.url = arg;
      continue;
    }
    switch (arg) {
      case "--output":
      case "-o":
        options.output = args[++i];
        break;
      case "--format":
        options.format = args[++i];
        break;
      case "--extract-links":
        options.extractLinks = true;
        break;
      case "--extract-emails":
        options.extractEmails = true;
        break;
      case "--extract-phones":
        options.extractPhones = true;
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        process.exit(1);
    }
  }
  return options;
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                        "AppleWebKit/537.36 (KHTML, like Gecko) " +
                        "Chrome/120.0.0.0 Safari/537.36",
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(fetchUrl(new URL(res.headers.location, url).href));
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ html: data, finalUrl: url }));
      }
    );
    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
  });
}

function stripTags(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1]).trim() : "";
}

function extractHeadings(html) {
  const headings = [];
  const regex = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const text = stripTags(m[1]).trim();
    if (text) headings.push(text);
  }
  return headings;
}

function extractParagraphs(html) {
  const paragraphs = [];
  const regex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const text = stripTags(m[1]).trim();
    if (text.length > 30) paragraphs.push(text);
  }
  return paragraphs;
}

function extractLinks(html, baseUrl) {
  const links = [];
  const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set();
  let m;
  while ((m = regex.exec(html)) !== null) {
    try {
      const fullUrl = new URL(m[1], baseUrl).href;
      const text = stripTags(m[2]).trim().slice(0, 100);
      const key = `${text}|${fullUrl}`;
      if (!seen.has(key)) {
        seen.add(key);
        links.push({ text, url: fullUrl });
      }
    } catch (e) {
      // ignore malformed URLs
    }
  }
  return links;
}

function extractEmails(text) {
  const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  return [...new Set(text.match(regex) || [])].sort();
}

function extractPhones(text) {
  const regex = /(?:\+?64|0|(?:\+?61|0))?[-\s]?(?:\(?\d{2,4}\)?[-\s]?)?\d{3}[-\s]?\d{3,4}/g;
  return [...new Set(text.match(regex) || [])].sort();
}

function extractPageData(html, baseUrl, options) {
  const text = stripTags(html);
  const data = {
    source_url: baseUrl,
    title: extractTitle(html),
    headings: extractHeadings(html),
    paragraphs: extractParagraphs(html),
  };

  if (options.extractLinks) data.links = extractLinks(html, baseUrl);
  if (options.extractEmails) data.emails = extractEmails(text);
  if (options.extractPhones) data.phones = extractPhones(text);

  return data;
}

function saveJson(data, filename) {
  fs.writeFileSync(filename, JSON.stringify(data, null, 2), "utf8");
  console.log(`Saved JSON to ${filename}`);
}

function saveMarkdown(data, filename) {
  const lines = [`# ${data.title}`, ``, `Source: ${data.source_url}`, ``, `## Headings`];
  for (const h of data.headings) lines.push(`- ${h}`);

  lines.push("", "## Key Paragraphs");
  for (const p of data.paragraphs.slice(0, 50)) lines.push("", p);

  if (data.links) {
    lines.push("", "## Links");
    for (const link of data.links.slice(0, 100)) {
      lines.push(`- [${link.text || "link"}](${link.url})`);
    }
  }

  if (data.emails) {
    lines.push("", "## Emails Found");
    for (const email of data.emails) lines.push(`- ${email}`);
  }

  if (data.phones) {
    lines.push("", "## Phone Numbers Found");
    for (const phone of data.phones) lines.push(`- ${phone}`);
  }

  fs.writeFileSync(filename, lines.join("\n"), "utf8");
  console.log(`Saved Markdown to ${filename}`);
}

async function main() {
  const options = parseArgs();

  if (!options.url) {
    console.error("Usage: node web_research_helper.js <URL> [options]");
    process.exit(1);
  }
  if (!options.url.startsWith("http://") && !options.url.startsWith("https://")) {
    console.error("URL must start with http:// or https://");
    process.exit(1);
  }

  console.log(`Fetching ${options.url}...`);
  const { html, finalUrl } = await fetchUrl(options.url);

  console.log("Extracting content...");
  const data = extractPageData(html, finalUrl, options);

  const fmt = options.format === "markdown" ? "md" : options.format;
  const outputFile = options.output || `research_${new URL(finalUrl).hostname}.${fmt}`;

  if (fmt === "json") {
    saveJson(data, outputFile);
  } else {
    saveMarkdown(data, outputFile);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
