# Contributing to all_we_need

To add a project:
1. Add a markdown file to `/projects/` named `<slug>.md` (use hyphenated lowercase, e.g., `emailnator.md`).
2. **Frontmatter** (YAML) is required at the top of the file. Example:

---
title: "Emailnator"
link: "https://emailnator.example"
description: "Generate disposable Gmail-style emails"
tags: ["email", "productivity"]
screenshot: "assets/emailnator.png" # optional, relative path
---

3. Add optional longer README-like details after the frontmatter (this will appear on the project page).
4. If the link is a GitHub repo (https://github.com/owner/repo), the build will auto-fetch contributors (GitHub IDs and names).
5. Add screenshots to `/assets/` if desired (keep < 500 KB, max 1200px width).
6. Create a PR. The GitHub Action will validate the frontmatter and build the site on merge.

**Required fields**: title, link, description, tags (array of strings for categories).
**Validation**: PRs must include all required frontmatter fields. If missing, the build will fail.

**Recommended tags**: Use consistent tags like "devtools", "productivity", "email", "security", "web", "mobile", etc., to group projects on the homepage.

**Image rules**: Place screenshots in `/assets/`. The generator will copy them automatically.

**Link validation**: Links should be live (200 OK). The CI can be extended to check this.

**Attribution**: If content is from elsewhere, include attribution and license in the markdown.

This ensures the site stays automated, beautiful, and easy to maintain. Thanks for contributing! 🚀
