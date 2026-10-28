# Professor transparent cutout

Source: `prof_nicklas.png` (preserved).
Output: `prof_nicklas-cutout.png`, 1024 x 1536 RGBA.
Tool: built-in image_gen, background-extraction edit with transparent background.

## Final prompt

Use case: background-extraction. Edit target: the supplied professor illustration. Remove only the white/off-white background, including background gaps around the hair, arms and coat. Produce a true transparent RGBA PNG cutout. Preserve the exact same illustrated man, identity, face, glasses, hair, pose, proportions, white lab coat, blue shirt, trousers, shoes, Poké Ball and clipboard. Preserve all foreground white coat details; white clothing must remain opaque. Keep the entire original full-body composition and original 2:3 portrait aspect ratio, including both shoes. Do not redesign or add anything. No background, no floor, no backdrop glow, no text, no cast shadow and no fades applied to the person: lower-body fade and drop shadow will be handled separately in CSS. Save the output as a usable transparent image asset.

## Integration

Battle Arena uses the cutout with one CSS drop shadow and a vertical bottom-only
mask. No radial/side/head fade remains. Verified visually in light/dark Chrome
and checked the live local asset route (HTTP 200), transparent background alpha
and retained opaque coat pixels. No database migration was performed.
