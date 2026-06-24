# Research Tools

Two Node.js helpers for working with the New Zealand Gazette API and scraping public webpages.

## Requirements

- Node.js (already installed on this machine)
- No extra npm packages needed

## 1. NZ Gazette API Client

Queries the New Zealand Gazette through the DigitalNZ API.

```bash
node nz_gazette_client.js --query bankruptcy
node nz_gazette_client.js --query "land transfer" --pages 3 --format csv
node nz_gazette_client.js --notice-type "Land Notices" --date-from 2024-01-01
```

Options:
- `--query, -q` — search keywords
- `--notice-type, -t` — notice category
- `--date-from` — start date (YYYY-MM-DD)
- `--date-to` — end date (YYYY-MM-DD)
- `--pages` — number of pages to fetch (default: 1)
- `--per-page` — results per page (default: 20)
- `--format` — `json` or `csv` (default: json)
- `--output, -o` — output filename
- `--api-key` — DigitalNZ API key (optional, but recommended for heavy use)

## 2. Web Research Helper

Fetches a webpage and extracts title, headings, paragraphs, links, emails, and phone numbers.

```bash
node web_research_helper.js https://example.com/article
node web_research_helper.js https://example.com/listings --extract-links --output research.md
node web_research_helper.js https://example.com --extract-emails --extract-phones --format json
```

Options:
- `--output, -o` — output filename
- `--format` — `markdown`/`md` or `json` (default: markdown)
- `--extract-links` — include all links
- `--extract-emails` — include email addresses
- `--extract-phones` — include phone numbers

## 3. AI Dashboard

A live browser dashboard that runs the NZ Gazette client and streams tool status via Server-Sent Events.

```bash
node server.js
```

Then open **http://localhost:3000** in your browser.

Features:
- Left panel shows live agent status, active tools, runtime logs, and session metrics.
- Right panel has a search form that runs `nz_gazette_client.js` on the server.
- Results stream back in real time and are rendered as tables (JSON/CSV).
- No npm dependencies — uses only Node.js built-ins.

Use a custom port:
```bash
node server.js --port 8080
```

## Clone This Repo

```bash
git clone <your-remote-url> research-tools
cd research-tools
npm install
npm start
```

Then open **http://localhost:3000**.

There are no runtime npm dependencies — `npm install` simply validates the project. You can also run it directly with `node server.js`.

### Push to your own remote

Create a new empty repository on GitHub, GitLab, or Bitbucket, then:

```bash
cd research-tools
git remote add origin <your-remote-url>
git branch -M main
git push -u origin main
```

After that you can clone it onto any device with Node.js installed.

## Notes

- Be polite: add delays between requests and respect robots.txt.
- Only scrape public data you have permission to use.
- For the Gazette API, the DigitalNZ endpoint works without a key but may rate-limit heavy usage.
