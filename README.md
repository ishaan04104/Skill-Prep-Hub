# AI Skill IQ Prep Hub v9

Open `index.html` directly or host the folder on GitHub Pages.

## Permanent PDF auto-load

On GitHub Pages, the app now tries to auto-discover and parse every import-ready PDF inside:

```
reference_pdfs/
```

So for your hosted site, you can add a new formatted question-bank PDF to `reference_pdfs/`, commit it, wait for GitHub Pages to redeploy, and refresh the site with a cache-busting query such as `?v=newpdf1`.

The PDF must use the app's import format:

```
1. Question text?
A. Option A
B. Option B
C. Option C
D. Option D
Answer: B
Explanation: Explanation here.
Bank: Bank name
Topic: Topic name
Difficulty: Hard
```

## Local/custom-domain fallback

Browsers cannot list local folders. If you open the app from `file://` or use a custom domain where GitHub repo details cannot be inferred, update:

```
reference_pdfs/manifest.json
```

Example:

```json
{
  "files": [
    {"file": "my_new_questions.pdf", "bank": "My New Questions", "topic": "Imported PDF", "difficulty": "Very Hard"}
  ]
}
```

JSON remains the most reliable permanent format, but PDF auto-load now works for selectable-text PDFs following the required format.
