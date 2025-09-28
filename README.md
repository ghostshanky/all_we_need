# all_we_need Site Generator

A static site generator for a curated list of developer tools and projects. The site is built using Node.js and generates HTML pages from Markdown files.

## Features

- Generates static HTML from Markdown project files
- Fetches contributor data from GitHub API
- Creates sitemap and robots.txt
- Responsive design with search functionality
- Auto-generates project pages with logos and contributor lists

## Project Structure

- `projects/` - Directory containing Markdown files for each project
- `scripts/generate.js` - Main build script
- `templates/` - Template files for CSS, JS, and logo
- `docs/` - Output directory for generated site (served by hosting platforms)
- `assets/` - Static assets to copy to output

## How to Use

1. Add project Markdown files to the `projects/` directory
2. Run `npm run build` to generate the site in `docs/`
3. Deploy the `docs/` directory to your hosting platform

## Project Markdown Format

Each project file should be a Markdown file with frontmatter:

```yaml
---
title: Project Name
link: https://github.com/user/repo
description: Brief description
tags: [tag1, tag2]
screenshot: optional-screenshot-url
---
```

## Technologies Used

- Node.js
- Gray-matter for frontmatter parsing
- Marked for Markdown rendering
- XMLBuilder2 for sitemap generation
- Fuse.js for client-side search
