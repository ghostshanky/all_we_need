# Contributing to all_we_need

Welcome to the **all_we_need** project! We're building the most comprehensive, automated showcase of developer tools and hidden gems. 

## 🎯 How to Add a Project

### Step 1: Create Project File
Add a markdown file in `/projects/` directory named `<project-slug>.md`

### Step 2: Required Frontmatter (YAML)
Every project **MUST** include this frontmatter at the top:

```yaml
---
title: "Project Name"
link: "https://project-website.com"
description: "Clear, concise description (50-150 chars)"
tags: ["category1", "category2"]
screenshot: "assets/project-screenshot.png"  # optional
---
```

### Step 3: Content (Optional)
Add detailed project description, usage examples, or additional information below the frontmatter.

## 📋 Field Requirements

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| `title` | ✅ | Project name | "Emailnator" |
| `link` | ✅ | Project URL or GitHub repo | "https://github.com/user/repo" |
| `description` | ✅ | Brief description | "Generate disposable emails" |
| `tags` | ✅ | Categories (2-4 tags) | ["email", "productivity"] |
| `screenshot` | ❌ | Image path | "assets/project-name.png" |

## 🏷️ Recommended Tags

**Development Tools:** `devtools`, `api`, `testing`, `debugging`, `monitoring`
**Productivity:** `productivity`, `automation`, `workflow`, `organization`
**Design:** `design`, `ui`, `icons`, `fonts`, `colors`
**Learning:** `learning`, `documentation`, `tutorials`, `resources`
**Security:** `security`, `privacy`, `encryption`, `authentication`
**Web:** `web`, `frontend`, `backend`, `fullstack`
**Mobile:** `mobile`, `ios`, `android`, `react-native`
**Data:** `database`, `analytics`, `visualization`, `ai`

## 📸 Image Guidelines

- Screenshots go in `/assets/` directory
- Max file size: 500KB
- Recommended dimensions: 1200x630px
- Formats: PNG, JPG, WebP
- Name format: `project-name.png`

## ✅ Validation Rules

Your PR will be automatically validated:
- ✅ Required frontmatter fields present
- ✅ Valid URL format
- ✅ Proper tag format (array)
- ✅ File naming convention
- ✅ Image size limits

## 🔄 Automation Features

When your project is merged:
1. **Logo extraction:** Automatically fetched from website favicon or GitHub avatar
2. **Contributors:** Auto-populated for GitHub repos
3. **Search indexing:** Added to site search functionality
4. **SEO optimization:** Meta tags and sitemap updated
5. **Categorization:** Grouped by tags on homepage

## 🚀 Example Project File

```markdown
---
title: "DevTools Collection"
link: "https://github.com/user/devtools"
description: "Curated list of essential developer tools and utilities"
tags: ["devtools", "resources", "productivity"]
screenshot: "assets/devtools-collection.png"
---

## About
This project provides a comprehensive collection of developer tools...

## Features
- Tool categorization
- Regular updates
- Community contributions

## Usage
Visit the repository to explore the full collection.
```

## 🛡️ Quality Standards

- **Accuracy:** All links must be working and accurate
- **Relevance:** Projects should be useful for developers
- **Quality:** No spam, affiliate links, or low-quality tools
- **Attribution:** Credit original creators properly
- **Licensing:** Respect project licenses and terms

## 📞 Need Help?

- Check existing projects in `/projects/` for examples
- Open an issue for questions
- Join our community discussions

**Happy contributing! 🎉**