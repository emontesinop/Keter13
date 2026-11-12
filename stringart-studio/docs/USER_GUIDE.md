# User guide

## 1. Create a project
Click **New project**, or drop an image on the start screen. JPG, PNG, WEBP, TIFF and BMP are
accepted. A `.saproj` file reopens a project exported from another computer. Projects save
automatically (default location: `~/.stringart_studio`, or set the `STRINGART_HOME` environment
variable).

## 2. Analyse and adjust the image (left panel, Image view)
* **Image** tabs: *Original*, *Framed* (crop as it will sit on the board), *Processed*, *Edges*,
  *Priority map* (where accuracy matters most), *Subject mask* and *Thread preview*. The thread
  preview shows how the processed image should look in your thread colour on your board; the
  optimiser aims for this.
* Detected faces are outlined in blue, and the portrait is centred and zoomed automatically. Turn off
  *Auto-centre* or *Auto-zoom* to frame it yourself.
* Analysis tips appear under the image (low contrast, busy background, and so on).
* For portraits: raise *Local contrast*, set *Background → Simplify/Remove*, and use the *Max contrast*
  mode.

## 3. Board & nails
Choose the shape, size, nail count (50–500 in the slider, up to 1000 by typing), margin, nail diameter
and height, numbering direction and the position of nail 1. The **Board** view shows every numbered
nail: scroll to zoom, drag to pan. Template PDFs, SVG and DXF can be exported from there before you
generate anything.

## 4. Thread
*Monochrome* presets: white on black, black on white, red on black, on wood, or custom colours.
*Multi-colour*: pick a palette preset (CMYK, RGB or warm) or build your own with up to 12 real thread
colours. Thread thickness and fibre opacity drive the physical tone simulation.

## 5. Generate (right panel)
Pick a mode, then click **Generate string art**. Lines appear live; you can cancel at any time. Every
run is saved as a **version**. Open *Advanced parameters* to tune the maximum number of connections,
stopping rules, comparison resolution, minimum nail skip, overshoot penalty, strategy (continuous or
hybrid with a maximum number of sections) and route mode.

## 6. Route
The **Route** tab shows, for each colour, whether the thread is one continuous piece and how many
sections are needed. It also shows the mathematical minimum (Euler bound) and the validation result.
In *Practical* route mode you get **bridge proposals**: extra connections that would join sections,
each with its visual cost. Tick the ones you accept and click **Apply**. Nothing is ever added
without your approval.

## 7. Simulate and build
The **Simulator** replays the real nail-to-nail order. Use the controls or the keyboard (space,
← and →) to move through it. The panel shows the current nail (blue), target nail (red) and the next
nail (green), and warns when a new section starts. The **Sequence** tab is the build checklist:
search a nail number to list every step at that nail, and click a row to jump the simulator.

## 8. Export
The **Export** tab has the construction manual (PDF), full-scale and A4-tiled nail templates
(check the 100 mm calibration bar after printing), SVG, DXF and G-code for CNC, the sequence as CSV
or JSON, nail coordinates, artwork images, GIF or MP4 animations, a step image ZIP and the portable
project file.

## Building tips
* Paint the board first, tape on the template, nail with a depth gauge, then remove the paper.
* Tie a double knot on the first nail of a section and add a drop of glue. Keep the tension
  consistent.
* Each step goes from the nail you are on to the listed nail, passing around the far side of it.
* Tick steps off in the PDF table or note the last step number when you pause.
