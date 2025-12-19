/**
 * Background Video Manager
 * Orchestrates cinematic background videos with IntersectionObserver
 * Handles fallbacks for low power, mobile, and load failures.
 */

document.addEventListener("DOMContentLoaded", () => {
    const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isMobile = window.innerWidth < 768;
    const isLowPower = navigator.connection && navigator.connection.saveData;

    const videos = document.querySelectorAll('.cinematic-video');

    if (isReducedMotion || isMobile || isLowPower) {
        console.log("AWN: Cinematic Mode Disabled (Performance/Preference)");
        videos.forEach(v => v.remove()); // Remove videos to ensure fallback image shows
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const video = entry.target;
            if (entry.isIntersecting) {
                // Play video (lazy load source if needed, currently src is direct)
                const playPromise = video.play();
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        video.style.opacity = video.dataset.opacity || "0.2"; // Fade in to target opacity
                    }).catch(error => {
                        console.warn("Autoplay prevented:", error);
                        video.style.display = 'none'; // Fallback covers it
                    });
                }
            } else {
                video.pause();
                video.style.opacity = "0"; // Fade out
            }
        });
    }, {
        threshold: 0.1 // Trigger when 10% visible
    });

    videos.forEach(video => {
        // Setup initial state
        video.style.opacity = "0";
        video.muted = true; // Force mute

        // Error handling
        video.addEventListener('error', () => {
            console.warn("Video load failed, using fallback.");
            video.style.display = 'none';
        });

        // Parallax Effect (Simple)
        if (video.closest('#hero')) {
            window.addEventListener('scroll', () => {
                const scrolled = window.scrollY;
                if (scrolled < window.innerHeight) {
                    video.style.transform = `translate(-50%, calc(-50% + ${scrolled * 0.15}px))`;
                }
            });
        }

        observer.observe(video);
    });
});
