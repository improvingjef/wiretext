# WireText

WireText is a lightweight DSL for UI intent, inspired by Markdown syntax.

Inspired by Markdown, it is readable in a terminal, friendly in docs, and fast to iterate with teammates and AIs.
This is not a 1:1 mapping for HTML. The goal is to express the intent of a screen without the rabbit hole of making it perfect. 
In all honesty, this is barely tested, but it's been helpful working with Claude and Codex. PRs are welcome, but the goal is simplicity. 

## What is in this repo

- `index.html`: marketing site + embedded playground
- `playground.js`: parser and renderers (ASCII + HTML preview + AST panel)
- `artifacts/ast/codex-layout.ast.json`: canonical AST artifact for the Codex layout example

## Local usage

Open `index.html` directly in your browser.

## GitHub Pages

Yes, GitHub Pages is a good fit for this project.

Recommended setup:

1. Push this repo to `main`.
2. In GitHub: `Settings -> Pages`.
3. Source: `Deploy from a branch`.
4. Branch: `main`, folder: `/ (root)`.
5. Save.

Your site will publish from the root `index.html`.

## License

MIT
