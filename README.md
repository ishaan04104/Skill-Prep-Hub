# AI Skill IQ Prep WebApp v5

Open `index.html` in a browser.

## What changed in v5

- Fixed PDF import parsing for multi-page PDFs.
- PDF text is now reconstructed by visual lines instead of being treated as one long line.
- The parser now ignores PDF headers/front-matter and detects real MCQ blocks more strictly.
- Added reliable import files in `import_banks/`:
  - `Advanced_Very_Hard_LLM_RAG_Question_Bank.json` — recommended import format
  - `Advanced_Very_Hard_LLM_RAG_Question_Bank.txt` — offline-friendly text import
  - `Advanced_Very_Hard_LLM_RAG_Architecture_Config_Evaluation_Question_Bank.pdf` — selectable-text PDF import

## Best way to import questions

Use JSON when possible. It avoids PDF extraction differences between browsers.

1. Go to **Import**.
2. Choose `import_banks/Advanced_Very_Hard_LLM_RAG_Question_Bank.json`.
3. Click **Parse file**.
4. Confirm it says **85 questions parsed successfully**.
5. Click **Save parsed questions**.

PDF import also works for selectable-text PDFs when the browser can load PDF.js from the internet/CDN. If PDF import ever fails, use the JSON or TXT file.

## Supported import formats

```text
1. Question text?
A. Option A
B. Option B
C. Option C
D. Option D
Answer: B
Explanation: Why B is correct.
Bank: Custom Bank
Topic: Custom Topic
Difficulty: Very Hard
```

JSON format:

```json
{
  "questions": [
    {
      "id": "custom_001",
      "bank": "Custom Bank",
      "topic": "RAG Evaluation",
      "difficulty": "Very Hard",
      "question": "Question text?",
      "choices": ["A option", "B option", "C option", "D option"],
      "answerIndex": 1,
      "answerLetter": "B",
      "explanation": "Explanation text."
    }
  ]
}
```

## Hosting

This is a static app. You can host it free on Netlify Drop, GitHub Pages, or Vercel.


## v6 import flow clarification

1. Open **Import**.
2. Choose a PDF/TXT/JSON file.
3. Click **Parse file** to preview extracted questions. This does not add them to practice yet.
4. Click **Save parsed questions to app** to store them in browser local storage.
5. The imported bank is automatically selected in Practice Setup, and topics are available as optional filters.
6. Use **Export custom JSON** or **Export custom TXT** to back up imported questions.

If a browser blocks downloads while opening `index.html` from local files, host the folder on Netlify/GitHub Pages or use a desktop browser.
