---
title: Unsplash API
link: https://unsplash.com/developers
description: The most powerful free image API associated with the world's largest free image library.
tags: ["api", "images", "media"]
date: 2026-01-07
---

# Why It's Great
The Unsplash API provides access to the world's most generous community of photographers. It's the engine behind thousands of apps, providing high-quality, royalty-free images for:
- **Poster Apps**: Create stunning print-on-demand products.
- **Photo Editors**: Offer a vast library of stock photos to users.
- **Wallpaper Apps**: Access millions of high-res backgrounds.
- **UI Mockups**: Populate your designs with beautiful, real-world imagery.

# Quick Start

1. **Create Account**: Sign up at [unsplash.com/developers](https://unsplash.com/developers).
2. **Get API Key**: Create a new application to get your Access Key.
3. **Fetch Photos**: Use simple HTTP requests.

## Example (JavaScript)

```javascript
const url = 'https://api.unsplash.com/photos/random?client_id=YOUR_ACCESS_KEY';

async function fetchImage() {
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        console.log('Image URL:', data.urls.regular);
        console.log('Photographer:', data.user.name);
    } catch (error) {
        console.error('Error fetching image:', error);
    }
}

fetchImage();
```

## Example (HTTP)

```http
GET /search/photos?query=nature
Host: api.unsplash.com
Authorization: Client-ID YOUR_ACCESS_KEY
```

The API returns a JSON response containing image URLs (raw, full, regular, small), photographer details, and download links.
