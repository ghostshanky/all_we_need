
// All We Need - Premium Motion & Interactions
// Depends on: GSAP, ScrollTrigger, Lenis (loaded in HTML)

document.addEventListener("DOMContentLoaded", () => {

    // 1. Initialize Lenis (Smooth Scroll)
    const lenis = new Lenis({
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        direction: 'vertical',
        gestureDirection: 'vertical',
        smooth: true,
        mouseMultiplier: 1,
        smoothTouch: false,
        touchMultiplier: 2,
    });

    function raf(time) {
        lenis.raf(time);
        requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    // Integrate with GSAP ScrollTrigger
    gsap.registerPlugin(ScrollTrigger);

    // 2. Hero Animations
    initHero();

    // 3. Section Reveals
    initScrollReveals();

    // 4. Counter Animations
    initCounters();

    // 5. Narrative Scroll (How It Works)
    initNarrative();

    // 6. Header Morph Logic
    initHeaderMorph();

    console.log("AWN: Motion System Active");
});

function initHero() {
    const tl = gsap.timeline();

    tl.from("#hero h1", {
        y: 100,
        opacity: 0,
        duration: 1.5,
        ease: "power4.out",
        delay: 0.2
    })
        .from("#hero p", {
            y: 30,
            opacity: 0,
            duration: 1,
            ease: "power3.out"
        }, "-=1")
        .from("#heroSearchWrapper", {
            scale: 0.95,
            opacity: 0,
            duration: 1.2,
            ease: "expo.out"
        }, "-=0.8");

    // Parallax
    gsap.to("#hero", {
        scrollTrigger: {
            trigger: "#hero",
            start: "top top",
            end: "bottom top",
            scrub: true
        },
        y: 100,
        opacity: 0.5
    });
}

function initHeaderMorph() {
    const heroSearch = document.getElementById('heroSearchWrapper');
    const headerSearchBtn = document.getElementById('headerSearchBtn');
    const headerTitle = document.querySelector('#header .font-semibold');

    if (!heroSearch) return;

    ScrollTrigger.create({
        trigger: "#hero",
        start: "bottom top+=100", // When hero bottom passes top + 100px
        onEnter: () => {
            // Hero gone -> Show Header UI
            gsap.to(headerSearchBtn, { autoAlpha: 1, scale: 1, duration: 0.3 });
        },
        onLeaveBack: () => {
            // Back to Hero -> Hide Header UI
            gsap.to(headerSearchBtn, { autoAlpha: 0, scale: 0.75, duration: 0.3 });
        }
    });
}

function initScrollReveals() {
    // Generic reveal for sections
    document.querySelectorAll('section').forEach(section => {
        gsap.fromTo(section,
            { y: 50, opacity: 0 },
            {
                scrollTrigger: {
                    trigger: section,
                    start: "top 85%",
                },
                y: 0,
                opacity: 1,
                duration: 1,
                ease: "power3.out"
            }
        );
    });

    // Staggered lists (projects, contributors)
    // Assuming .reveal-stagger class on items
    ScrollTrigger.batch(".reveal-stagger", {
        onEnter: batch => gsap.to(batch, { autoAlpha: 1, y: 0, stagger: 0.1, overwrite: true }),
    });
}

function initCounters() {
    const counters = document.querySelectorAll('.stat-counter');
    counters.forEach(counter => {
        const target = parseInt(counter.dataset.target || "0");

        ScrollTrigger.create({
            trigger: counter,
            start: "top 90%",
            once: true,
            onEnter: () => {
                gsap.to(counter, {
                    innerText: target,
                    duration: 2,
                    snap: { innerText: 1 },
                    ease: "power2.out",
                    onUpdate: function () {
                        // formats 1000 -> 1,000 if needed, or just keep raw
                        // this.targets()[0].innerText = Math.ceil(this.targets()[0].innerText); 
                    }
                });
            }
        });
    });
}

function initNarrative() {
    const steps = document.querySelectorAll('.narrative-step');
    steps.forEach((step, i) => {
        gsap.from(step, {
            scrollTrigger: {
                trigger: step,
                start: "top 80%",
            },
            x: i % 2 === 0 ? -50 : 50, // Alternate entry
            opacity: 0,
            duration: 1,
            ease: "power3.out"
        });
    });
}

// Logic for Projects Fold/Expand
window.toggleGroup = function (id) {
    const content = document.getElementById(id);
    const btn = document.getElementById('btn-' + id);
    if (content.style.maxHeight) {
        content.style.maxHeight = null;
        content.style.opacity = '1'; // Keep opacity logic simple for collapse
        btn.innerText = "Show All";
    } else {
        content.style.maxHeight = content.scrollHeight + "px";
        content.style.opacity = '1';
        btn.innerText = "Show Less";
    }
}
