# Turning on GitHub Pages

`github-pages-workflow.yml` publishes `Self-assessment tool/dist/index.html` to GitHub Pages.
It is kept here rather than in `.github/workflows/` for two reasons: it is not meant to run
yet, and pushing into `.github/workflows/` needs a token scope this repo was created without.

## When Dan clears the content

The engine is unclassified and holds no data. What becomes public is the **176 questions** -
his DRAFT framework. That is a sequencing decision for him, not a security one.

Then, in order:

```bash
gh auth refresh -s workflow                       # one time, grants the scope
mkdir -p .github/workflows
git mv deploy/github-pages-workflow.yml .github/workflows/pages.yml
git commit -am "Enable GitHub Pages"
gh repo edit --visibility public --accept-visibility-change-consequences
git push
```

Then Settings > Pages > Source: GitHub Actions. The workflow runs the tests before it
publishes, so a broken build never reaches the URL.

## Why public is required

GitHub Pages only serves public repositories on a free account. If the questions have to stay
private, the alternatives are a paid plan, or hand people `dist/index.html` directly - it is
one self-contained file and works identically from an email attachment.

## What hosting does and does not change

- **Does not change** how information is handled. The page carries
  `default-src 'none'; connect-src 'none'`, so it cannot transmit anything from anywhere it is
  loaded. Hosted or opened from a file, the data behaviour is identical.
- **Does change** version drift. A hosted copy means everyone answers the current rubric.
  Files scatter, and people fill in old versions - which is why every assessment records the
  rubric version it was answered against.
- **Does change** what a department has to trust. For a demo, a github.io URL is fine. For
  real Protected B use, expect to be asked for a GC-controlled location, or just the file.
