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

## Notes

- Be polite: add delays between requests and respect robots.txt.
- Only scrape public data you have permission to use.
- For the Gazette API, the DigitalNZ endpoint works without a key but may rate-limit heavy usage.
