# Collision illustration assets

Generated with built-in image_gen on 2026-10-03. These are decorative original illustrations, not Wikipedia images or historical Bauhaus artwork. Final delivery paths:

- `public/images/collision/octopus.webp`: transparent engraved octopus, 1086 × 1448, WebP quality 85, alpha quality 100.
- `public/images/collision/octopus-small.webp`: mobile delivery at 600 × 800, WebP quality 76, alpha quality 100.
- `public/images/collision/tear.webp`: transparent blue/black ragged seam, trimmed to alpha bounds and delivered at 188 × 1600, WebP quality 88, alpha quality 100. It may rotate for the mobile seam.

Originals remain in the generated_images directory. Optimization uses existing sharp; no product text is embedded. Blue circles/rectangles are authored CSS geometry.

## Fonts

Self-hosted display fonts use official Google Fonts distributions:

- `src/assets/fonts/prata-400.ttf`: Prata 400, [official source and OFL license](https://github.com/google/fonts/tree/main/ofl/prata), local license `prata-OFL.txt`.
- `src/assets/fonts/oswald-700.ttf`: Oswald 700, [official source and OFL license](https://github.com/google/fonts/tree/main/ofl/oswald), local license `oswald-OFL.txt`.

Distribution URLs were obtained from Google Fonts CSS; production loads local files, not remote font services. Source and license retain their original names and content. The final bundle measurement includes TTF along with other fonts.

## Octopus prompt

Use case: stylized-concept. Asset type: transparent decorative illustration cutout for an avant-garde encyclopedia website, no UI text. A spectacular black-ink 19th-century natural history copperplate engraving of an octopus, front-three-quarter close-up, enormous expressive eye near upper center, eight richly intertwined long tentacles with carefully etched suction cups, elegantly extending toward the left and lower edges, one curled tentacle reaching upward. Detailed stippling, crosshatching, irregular print ink and fine engraved lines, museum-quality scientific illustration with strong dark silhouette and very fine lighter engraving gaps. Pure black ink only; ALL light areas and backdrop transparent, no white paper rectangle, no solid white background, no text, no borders, no captions, no symbols. Portrait composition around 3:4, octopus fills most of frame with tentacles naturally cropped at lower left, leave transparent negative space on upper right so live article title can sit nearby. Suitable for compositing on paper-white website ground and substantial scaling on desktop. Not a cute mascot, no cartoon, no photoreal color, no gray rectangular backdrop, no drop shadow. Match the reference's black engraved octopus material, but create this as a standalone cutout rather than a screenshot of the site.

## Tear prompt

Use case: stylized-concept. Asset type: standalone transparent paper-tear texture strip for the seam of an avant-garde editorial website. A single extremely tall narrow vertically oriented organically jagged torn paper edge, with thin layered strips of electric ultramarine blue paper and dense black ink exposed beneath warm ivory paper. Image composition portrait, seam runs from TOP EDGE to BOTTOM EDGE near CENTER. Most image width is transparent. Visible strip is irregular roughly 15 percent of image width, occasionally widening to 25 percent, no other objects. Ragged cotton paper fibers, convincing rough torn edge, black print speckles, very subtle shallow material shadow following only edge; dramatic high-contrast blue-black rupture like the reference's central seam. Ivory bits only as narrow fringes on the tear, no white rectangular sheet or panel, no book, no text, no typography, no octopus, no geometric motifs. Deliver on true transparent background with organically cut alpha silhouette. Texture must work scaled vertically for desktop or rotated horizontally for mobile; extends through both ends, never tapers to a point. Physical torn-paper collage material, not a lightning bolt, not a vector zigzag, not a cosmic crack.
