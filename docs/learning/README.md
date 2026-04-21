# DermaCloud — Learning the Codebase

These docs exist so the product owner can genuinely own the DermaCloud codebase before shipping it to paying clinics — not just ship features. They are written for a **Java developer** who is new to the JS/TS/React/Next.js stack, so concepts are tied back to Java analogies wherever a clean mapping exists.

The chapters go **top-down**: a mental model of the whole system first, then the plumbing (auth, DB, API routes), then one full vertical slice end-to-end, then the remaining modules, then a debugging drill.

## Chapter index

| # | Chapter | Status |
|---|---|---|
| 1 | [Architecture overview](01-architecture.md) | ✅ complete |
| 2 | [TS / React / Next.js survival kit for Java devs](02-survival-kit.md) | ✅ complete |
| 3 | [Auth, middleware, and JWT](03-auth-middleware-jwt.md) | ✅ complete |
| 4 | [Data models (Mongoose)](04-data-models.md) | ✅ complete |
| 5 | [The API route pattern](05-api-route-pattern.md) | ✅ complete |
| 6 | [Cosmetology visit → consultation → PDF (end-to-end)](06-cosmetology-end-to-end.md) | ✅ complete |
| 7 | [Dermatology visit + AI pipeline](07-dermatology-ai-pipeline.md) | ✅ complete |
| 8 | Pharmacy (sales / purchases / returns) | ⚪ pending |
| 9 | Templates, analytics, dashboard | ⚪ pending |
| 10 | Debugging drill | ⚪ pending |

Legend: ⚪ pending · 🟡 in progress · ✅ complete

## How to read these docs

- Each chapter stands on its own but assumes you've read the earlier ones.
- Code examples use real file paths from this repo, not invented snippets. When a file is referenced, open it side-by-side while reading.
- "Gotcha" callouts mark the bugs that are easy to introduce — the things you'll want to remember when something breaks in production.
- End of each chapter has a short **"If I changed X, what breaks?"** section. Those are comprehension checks — if you can't answer confidently, re-read that chapter before moving on.
