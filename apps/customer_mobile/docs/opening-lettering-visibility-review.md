# Opening lettering visibility correction

The destination preparation optimization mounts Home at timeline 0.62 and warms its paint at 0.88. The overlay remains above the navigator, but a busy UI frame can advance the wall-clock controller past the 0.69–0.83 lettering reveal and 0.88–0.94 completed-logo hold. Previously those stages had no frame presentation boundary. Existing timeline tests also bypassed artwork loading, so opacity assertions could pass with empty artwork widgets.

The opening now clamps at 0.76 (visible lettering within the existing rightward reveal) and 0.88 (opaque official full wordmark). It finishes building/painting each checkpoint frame before restarting the controller clock. This retains destination preparation, hidden Home paint warming, the existing 252 ms completed-logo hold, and the 252 ms fade. Normal playback adds only the checkpoint frame scheduling overhead; long frames cannot skip directly to Home. Reduced motion retains the static full logo and 350 ms presentation. Artwork, gradients, sizes, utensil paths, bootstrap, restoration, authorization, and generated plugin files are unchanged.

Validation uses production asset loading and captures the complete composited widget tree. Pixel assertions detect emerald lettering in the reveal clip, every completed-wordmark glyph, the F, centered original bounds, and absence of Home's contrasting red paint behind the opaque opening. Two deliberately long frame intervals exercise skipped wall-clock time. Existing tests cover stage boundaries, opacity, clipping geometry, route replacement, readiness waits, and secure startup failures. Ordinary timeline assertions now pump consecutive frames rather than treating a multi-second pump as visible playback.

With FEASTA_OPENING_DIAGNOSTICS=true, the normal-motion visibility test reports this sanitized order:

    lettering_reveal
    lettering_frame_presented
    completed_wordmark_hold
    completed_wordmark_frame_presented
    opening_destination_fade_boundary
    destination_fade
    opening_complete

The frame-presented markers are post-frame build/paint observations, not proof of Android compositor scanout. Pixel tests confirm composited widget output. Physical display confirmation remains for realme C55 review. No commits, pushes, merges, or deployments were performed.

Results: all 34 focused splash/startup tests passed; both diagnostic pixel-visibility cases passed; changed-file Flutter analysis reported no issues; git diff --check passed (existing CRLF conversion notices only).
