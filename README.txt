Mobile stability patch for AI Skill IQ Prep WebApp v6.

Replace only these two files in your GitHub repository root:
- app.js
- styles.css

Then commit changes and open your live site with a cache buster such as:
https://ishaan04104.github.io/ai-skill-iq-prep-hub/?v=mobile-v7

Fixes included:
- Setup drawer now closes correctly when Start session is tapped.
- Removed the mobile ReferenceError caused by closeSetupRail being scoped inside bindEvents.
- Session rendering now has a fallback if no question loads.
- Concept view recursion risk fixed.
- Mobile Safari scrolling and bottom safe-area handling improved.
- Navigation overflow/glitches improved for small screens.
- Question cards, answer choices, import page, library, concept cards, and results made more responsive.
