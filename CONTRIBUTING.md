# Contributing to All We Need 🚀

Thank you for your interest in contributing! **All We Need** is a community-driven hub for curated developer tools. We value high-quality, zero-spam submissions.

## How to Add a Project

1.  **Fork & Clone**: Fork this repository and clone it to your local machine.
2.  **Create a File**: Add a new markdown file in `/projects/`.
    *   **Filename**: Use hyphenated lowercase (e.g., `emailnator.md`, `openrouter.md`).
3.  **Frontmatter (YAML)**: Add the required metadata at the top of your file:

    ```yaml
    ---
    title: "Tool Name"
    link: "https://tool-url.com"
    description: "A short, punchy description of what it does."
    tags: ["category1", "category2"]
    screenshot: "assets/filename.png" # Optional but recommended
    ---
    ```

    *   **Required Fields**: `title`, `link`, `description`, `tags`.
    *   **Tags**: Use existing tags like `devtools`, `productivity`, `ai`, `security`, `design` where possible.

4.  **Content**: Below the frontmatter, you can add a more detailed explanation, features, or code snippets using standard Markdown.
5.  **Screenshots**:
    *   Place images in the `assets/` directory.
    *   Keep file size under **500KB** (WebP/PNG preferred).
    *   Reference it in the `screenshot` field in frontmatter (e.g., `assets/my-tool.png`).

6.  **Submit PR**: Create a Pull Request to the `master` branch. The automated build system will validate your changes.

## Guidelines

*   **No Spam**: Only submit tools that are genuinely useful for developers.
*   **Open Source**: We love open-source tools!
*   **Quality**: Ensure links are working and descriptions are grammatically correct.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
