# Calculator app

Small, dependency-free calculator you can run locally in a browser.

## Run

Option A (simplest): open `index.html` in your browser.

Option B (recommended): run a local static server:

```bash
cd "/Users/username/Documents/Codex/Antropic /calculator-app"
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Notes
- Supports `+ - * /` and parentheses, including unary `-` (e.g. `-(3+4)`).
- Keyboard: digits, `.`, `+ - * /`, parentheses, `Enter` to evaluate, `Esc` to clear, `Backspace` to delete.
- History is stored in your browser `localStorage`.

