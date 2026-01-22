/**
 * Swipe Navigation Logic
 * Detects horizontal swipes and triggers navigation.
 * 
 * Usage:
 * initSwipeNav({
 *   left: () => { console.log('Swipe Left'); },   // e.g., Go to NEXT page
 *   right: () => { console.log('Swipe Right'); }  // e.g., Go to PREV page
 * });
 */

const SWIPE_THRESHOLD = 80;      // Minimum distance in pixels
const TIME_THRESHOLD = 500;      // Maximum time in ms
const ANGLE_THRESHOLD = 30;      // Maximum angle deviation from horizontal

let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;

function initSwipeNav(actions = {}) {
    document.addEventListener('touchstart', (e) => {
        // Ignore if multiple touches
        if (e.touches.length > 1) return;

        // Ignore if touching interactive elements (map controls, sliders, etc)
        // Check if target is inside a 'no-swipe' class or specific elements
        if (e.target.closest('.leaflet-control') ||
            e.target.closest('.card-scroll-view') || // Maybe allow visual scrolling?
            e.target.closest('button') ||
            e.target.closest('a') ||
            e.target.closest('input')) {
            // Let's be permissive but careful.
            // Actually, for Map, we might want to disable swipe unless near edge?
            // For now, let's just log and track.
            // return; 
        }

        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (e.changedTouches.length !== 1) return;

        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const touchEndTime = Date.now();

        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;
        const duration = touchEndTime - touchStartTime;

        // Check Time
        if (duration > TIME_THRESHOLD) return; // Too slow, probably drag

        // Check Distance
        if (Math.abs(diffX) < SWIPE_THRESHOLD) return; // Too short

        // Check Angle (Must be horizontal-ish)
        // If Y difference is too big compared to X, it's vertical scroll
        if (Math.abs(diffY) > Math.abs(diffX) * 0.8) return;

        // Additional Check: If Scrollable Container?
        // If user is scrolling a list horizontally, we should not trigger nav.
        // Simple logic: If we are not at the edge of a scroll container, don't nav?
        // For MVP: Global swipe.

        if (diffX > 0) {
            // Swipe Right ( -> )
            if (actions.right) {
                // Visual feedback?
                actions.right();
            }
        } else {
            // Swipe Left ( <- )
            if (actions.left) {
                actions.left();
            }
        }
    }); // Passive false? No, we don't prevent default.
}

window.initSwipeNav = initSwipeNav;
