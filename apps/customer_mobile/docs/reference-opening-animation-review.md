# Reference-video opening review

This update supersedes the 1.8-second choreography described in mobile-branding-opening-review.md.

Studied the supplied gemini_generated_video_6ea2a964.mp4 (240 frames at 24 fps, 10 seconds), sampling the compact upright fan, outward spinning separation, rotating return, assembled F hold, rightward lettering reveal, and completed wordmark. The video is choreography reference only; no video playback or new runtime dependencies were added.

The native Flutter timeline is 4200 ms after asset/first-frame readiness:

| Time | Presentation |
| --- | --- |
| 0–420 ms | Compact upright utensil fan, centered |
| 420–1428 ms | Utensils separate in three directions with rotation and scale |
| 1428–2478 ms | Curved return paths and rotation into original assembly coordinates |
| 2478–2604 ms | Crossfade to official assembled F to resolve component gradient seams |
| 2604–2898 ms | Assembled F holds |
| 2898–3612 ms | Original aligned easta artwork slides right from behind F, with a subtle settle; logo composition recenters |
| 3612–3696 ms | Crossfade to original complete wordmark |
| 3696–3948 ms | Complete wordmark holds |
| 3948–4200 ms | Fade to the current app destination |

Original branding assets and gradients are untouched. The existing MaterialApp.builder wrapper still mounts the underlying app immediately and covers its navigator; no route, authentication, App Check, authorization, or native splash changes are needed. Reduced motion retains the static official wordmark for 350 ms, without movement or fade. Normal navigation and resume do not replay the opening.

Focused widget coverage includes delayed readiness and compact initial poses; outward separation and rotation; exact component assembly positions; assembled-F hold; clipped horizontal lettering reveal; complete wordmark and handoff; startup changes and navigator replacement; fresh lifetime replay; no navigation/resume replay; reduced motion; and 320/800 logical-pixel viewports.

Stop for real-device review: cold-launch on portrait Android, especially the realme C55 and Android 12+, and inspect the native static splash exit, fan readability, rotating return, F alignment/gradient transition, lettering occlusion and settling, final hold, and destination handoff. Repeat with Remove animations enabled and ordinary background/resume. Widget checks cannot establish device rendering smoothness or OEM splash behavior.

No commit, push, merge, or deployment was performed.
