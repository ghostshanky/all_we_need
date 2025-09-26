
# 🌐 all_we_need  
*for devs, by devs*

---

## What is all_we_need?  
A community-driven hub for developers featuring:  

- 🛠 Useful dev tools  
- 🔗 Hidden & underrated websites  
- 💎 Secret gems worth bookmarking  
- 🧩 Neat techniques, hacks, and tricks

Entries are short, clear, and optionally include preview screenshots or live links for quick discovery.

---

## 📁 Repo Structure  
```
all_we_need/
│
├── README.md          # Project overview  
├── CONTRIBUTING.md    # How to contribute your gem  
├── projects/          # Individual entries (.md files)  
│   ├── emailnator.md  # Example: Temp email service  
│   ├── openrouter.md  # Example: Free API hub  
│   └──...  
└── assets/            # Screenshots & previews  

```
---

## ✨ How to Get Started  
- Browse entries inside `/projects/`  
- Click any `.md` file to read about a tool or website  
- Preview images (if available) live in `/assets/`

---

## 🖼 Entry Format Example  


# Tool / Website Name

*Link:* https://example.com  
*What it does:* One-line simple description.  
*Why it’s useful:* Short + direct reason.  

  <!-- Optional -->


---

## 🗂️ Projects Available  
- [Emailnator](projects/emailnator.md) — Generate disposable Gmail-style emails  
- [OpenRouter](https://openrouter.ai) — Free AI API router for developers  

---

# Contributing to all_we_need

To add a project:
1. Add a markdown file to `/projects/` named `<slug>.md`.
2. **Frontmatter** (YAML) is required at top of the file. Example:

---
```
title: "Emailnator"
link: "https://emailnator.example"
description: "Generate disposable Gmail-style emails"
tags: ["email", "productivity"]
screenshot: "assets/emailnator.png" # optional, relative path
```
---

Optional: longer README-like details after the frontmatter.

3. If the link is a GitHub repo, use its repo URL (https://github.com/owner/repo). The build will auto-fetch contributors.
4. Add screenshots to `/assets/` if you want.
5. Create PR. The GitHub Action will validate and build the site on merge.

**Validation**: PRs must include the required frontmatter fields. If a field is missing the build will fail and the bot will comment.


---

## 📜 License  
MIT License — free to use and share.

---

## 💡 Vision  
A minimalist, high-quality platform where developers discover only the best — no noise. Simple words. Structured knowledge. Hidden gems, revealed.

---![Project Preview](assets/e5ba1a89-dd91-405b-b96e-73e47078ef1e.jpg)


Want it even sleeker or with some extra flair? 😊
