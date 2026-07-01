# AI Skill IQ Prep Hub v10

Mobile-first static practice app for AI/ML/LLM/RAG/Prompt Engineering/Agentic AI Skill IQ-style prep.

## v10 changes

- Reference PDFs now load from `reference_pdfs/` once, then cache into browser localStorage.
- On later visits, cached reference PDF questions appear instantly instead of waiting for PDF parsing again.
- The app checks for new/changed PDFs in the background using GitHub file metadata or `reference_pdfs/manifest.json`.
- Added buttons on Import page:
  - Refresh reference PDFs
  - Clear PDF cache
- Wrong answers are now tracked persistently.
- Current missed questions are highlighted in Dashboard, Library, Session, and Results.
- Added one-click `Practice missed questions` from Dashboard and Results.

## Recommended permanent PDF workflow

1. Add import-ready PDFs to `reference_pdfs/`.
2. Commit to GitHub.
3. Open the site with a cache-busting URL, e.g. `?v=10`.
4. On first load, the browser parses the PDFs and caches them.
5. Future visits use the cached parsed questions immediately.

For best reliability, update `reference_pdfs/manifest.json` as well:

```json
{
  "files": [
    {
      "file": "my_question_bank.pdf",
      "bank": "My Question Bank",
      "topic": "Imported PDF",
      "difficulty": "Very Hard",
      "version": "2026-07-01"
    }
  ]
}
```

If you replace a PDF with the same filename, change the manifest `version` or click `Clear PDF cache` / `Refresh reference PDFs`.

## GitHub Pages replacement files

For an existing hosted v9 site, replace at least:

- `index.html`
- `app.js`
- `styles.css`
- `reference_pdfs/manifest.json` if you want manifest fallback/versioning

Then commit and open with `?v=10`.
