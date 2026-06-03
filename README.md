# Sage — website

The landing page for Sage, *a friendlier language for kinder times*.

A single static page — no build step, no dependencies beyond two Google Fonts.
All visuals are CSS and `<canvas>`; there are no image assets.

## Files
- `index.html` — the page
- `styles.css` — all styling (design tokens, components, responsive)
- `app.js` — fireflies, parallax, scroll progress, scroll-spy, reveal animations
- `.nojekyll` — tells GitHub Pages to serve the files as-is

## Deploying to GitHub Pages
1. Push these files to a repository.
2. In **Settings → Pages**, set the source to your default branch, root (`/`).
3. The site is live at `https://<user>.github.io/<repo>/`.

Because every path is relative, it works equally well from a project subpath
or a custom domain.

## Accessibility & motion
The page respects `prefers-reduced-motion`: fireflies render as static dots,
scroll animations resolve instantly, and decorative pulses are disabled.
