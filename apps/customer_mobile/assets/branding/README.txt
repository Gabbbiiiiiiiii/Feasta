FEASTA supplied brand assets — original geometry preserved

Source artwork:
feasta_full_wordmark.svg       = Group 9.svg (complete assembled FEASTA logo)
feasta_assembled_f.svg         = F — reference-matched fork and spoon.svg
feasta_fork.png               = Fork.png (transparent bitmap, 54 x 159)
feasta_knife.svg              = Knife.svg (99 x 33)
feasta_spoon.svg              = Spoon.svg (159 x 53)

Derived helper:
feasta_easta_only_aligned.svg = original lettering paths from Group 9.svg,
                                 with the two assembled F paths removed.
                                 Canvas remains 417 x 159 for exact alignment.
                                 Original gradient definitions are retained.

Reference assembly positions in 177 x 159 F layout (not screen pixels):
 fork PNG left approximately x=19.24, top y=0 (verify exact alignment visually)
 spoon left x=0, top approximately y=52.0536
 knife left x=78.8804, top y=0

Use the original Group 9.svg for the final fully-assembled logo, not a
retyped text label. Animate on one scaled 417 x 159 design-coordinate
canvas, adapting the entire canvas uniformly for different devices.
If compositing layers produces a gradient seam, crossfade to the full final
vector very briefly after assembly rather than redrawing the brand artwork.

Notes:
- The SVG components use gradients; do not replace with emoji/font glyphs.
- Flutter splash animation is separate from the Android native system splash.
- Use reduced-motion fallback and do not delay authentication or navigation.
- These assets are for local Codex use. Save/extract them in your local repo
  before asking Codex to implement the animation.
