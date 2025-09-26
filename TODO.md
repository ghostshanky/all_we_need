# TODO: Building allweneed.github.io

Breakdown of the approved plan into logical steps. I'll update this file after each completion.

## Step 1: Cleanup Useless Content
- [x] Delete redundant directories: all_we_need/ (original repo copy), perfect_all_we_need/ (prototype).
- [x] Delete temporary file: chatgpt_conversation_about_project.txt.
- [ ] Clean generated docs/ (if exists, to prepare for fresh build).
- [ ] Regenerate package-lock.json after npm install (removes old lock).

**Status**: Cleanup completed via commands. Root now clean: Core files (package.json, scripts/generate.js, templates/*, projects/*.md with valid frontmatter, .github/workflows/pages.yml) present. No useless content. Assets/ empty but MDs reference screenshots – generator handles missing with placeholders. All 3 projects (github-copilot.md, postman.md, visual-studio-code.md) have proper frontmatter (title/link/desc/tags/screenshot). Workflow exists for auto-deploy.

## Step 2: Install Dependencies
- [ ] Run `npm install` to ensure deps (gray-matter, marked, etc.) and update package-lock.json.
- [ ] Verify no errors; fuse.js in devDeps but search.js uses CDN (no issue).

## Step 3: Build the Site
- [ ] Run `npm run build` to generate docs/ (index.html, projects/*.html, projects.json, sitemap.xml, robots.txt).
- [ ] Check output: 3 projects, categories (e.g., "productivity", "api"), stats, SEO files.
- [ ] Validate: No skipped MDs (all valid), logos/contributors fetched.

## Step 4: Local Testing
- [ ] Run `npm run dev` (build + Python server on port 8000).
- [ ] Use browser to test: Homepage search (fuzzy, highlights, results dropdown), scroll (icon appears), category folds (if >6, but currently 3 projects), project pages (logos, contributors, MD content).
- [ ] Mobile view, SEO meta (view source).

## Step 5: Deploy
- [ ] Commit changes: `git add . && git commit -m "Complete site setup with automation" && git push origin main`.
- [ ] GitHub Actions triggers: Build/deploy to gh-pages branch.
- [ ] Verify live: https://allweneed.github.io (index, projects, sitemap.xml).

## Step 6: Post-Deployment & SEO
- [ ] Repo Settings > Pages: Confirm source=gh-pages / (root).
- [ ] Submit sitemap to Google Search Console (user action).
- [ ] Add more projects via PRs to test automation.
- [ ] Monitor Actions logs for future builds.

Next: Proceed to Step 2 (npm install).
