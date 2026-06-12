# Physical AI portfolio deck

Standalone HTML slide deck for the NBCamp-style robotics portfolio (Gesto, IoT, ShopPinkki, EduPing).

**Live:** open `index.html` locally or deploy this repo to Netlify.

Navigate with **← → Space**. **18 slides** — Problem/Solution/How/Proof/Growth arc per [The Construct robotics portfolio guide](https://www.theconstruct.ai/the-best-way-to-create-your-robotics-portfolio/); each project's **YouTube thumbnail appears once** at project intro only.

## Language toggle

- **Top-right pill** — `한국어` / `English` label shows the *other* language.
- **Default:** Korean (`ko`). Preference persists in `localStorage` key `portfolio-deck-lang`.
- Only one language is visible per slide (`data-lang="ko"` / `data-lang="en"` + `lang-ko` / `lang-en` on `<html>`).

## Local preview

```zsh
cd ~/portfolio-deck
python3 -m http.server 8877
# http://127.0.0.1:8877/
```

## Verify (optional)

From repo root with a local server on port 8877:

```zsh
node verify-deck-split.mjs
```
