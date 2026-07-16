# Importing past papers

The database is the source of truth: PDFs are read **once**, at import. After that
every feature works from the database only.

## Two steps, on purpose

Past-paper PDFs carry no machine-readable structure — question numbers, marks,
parts and mark schemes are visual conventions that differ per paper and subject.
A blind auto-parser produces silently wrong content, and the spec requires the
database to **never modify the original wording**. So:

```bash
# 1. Extract — reads the PDF and emits a JSON skeleton (text preserved verbatim)
node server/import-paper.js --extract paper.pdf > draft.json

# 2. Complete draft.json (split pages into questions, add marks/mark scheme/parts),
#    then import. The import is exact, validated and idempotent.
node server/import-paper.js draft.json
```

Step 1 requires `pdftotext` (poppler-utils). Step 2 requires nothing extra.

## Format

```jsonc
{
  "subject": "Mathematics",          // must match an existing subject
  "year": 2025,
  "component": 2,
  "duration_min": 90,
  "original_pdf_name": "math_2025_c2.pdf",
  "questions": [
    {
      "number": 1,
      "marks": 5,                    // question total
      "expected_mark": 4,            // fallback mark when AI is off (<= marks)
      "topic": "Integration",        // drives objective linking
      "text": "Question stem, LaTeX in \\( ... \\)",
      "original_pdf_page": 2,
      "calculator_allowed": true,
      "mark_scheme": "M1 ... A1 ...",
      "ai_feedback": "Preset feedback used when AI is unavailable",
      "objectives": ["11.1.1"],      // LO codes for this subject
      "images": [
        { "svg": "<svg …/>", "caption": "…", "page": 2 }
      ],
      "parts": [                     // omit for single-part questions
        { "letter": "a", "text": "…", "marks": 2, "expected_mark": 2,
          "mark_scheme": "M1", "ai_feedback": "…" }
      ]
    }
  ]
}
```

## Validation

The import refuses to run unless:

- subject / year / component are present and real,
- every question has text and `marks > 0`,
- `expected_mark <= marks`,
- **part marks sum exactly to the question's marks**, and part `expected_mark`s
  sum to the question's `expected_mark` (so paper totals can never drift).

Unknown objective codes are reported and skipped rather than failing the import.

## Idempotency

A question already present for that subject/year/component/number is **skipped**,
never rewritten or duplicated — re-running an import is safe.

## Images

Figures are stored as inline SVG in the `images` table (one question may have
several, each with a caption and its original PDF page). Raster extraction from
PDFs (`pdfimages`) is not wired up; the spec's MVP does not allow image uploads.
