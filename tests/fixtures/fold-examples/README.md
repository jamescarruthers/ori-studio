# Fold examples

Three Ori Studio projects that show how the Fold workspace's petal fold,
swivel fold and crimp tools are used. Each was folded through the real tools
in a browser (clicks on the folded pane, keys, the tool window) and saved
with File ▸ Save, the native `.osf` project format. Open one with File ▸ Open
and the Fold workspace replays it. Step through the strip at the top to see
each step.

Every step's `note` field says which tool and which clicks made it. The Fold
workspace shows the note of the step on screen in its Step pane, and marks
each card that has one in the strip. The click paths are repeated below.
`apps/web/src/fold/document/foldExamples.wasm.test.ts` opens each file the
way the app reads a project and replays every step through the real engine.
Every step must come back `ok`: none broken, locked or changed.

Positions are as seen on the folded pane when the click is made. "Enter"
commits the fold the window previews; the window's own button does the same.

## petal-fold.osf: the preliminary base, then the bird base

1. **Valley fold** (V). Locate line **Axiom 2: point onto point**. Click the
   top-right corner, then the bottom-left corner. Press Enter. The square
   folds along its diagonal.
2. **Valley fold**, Axiom 2. Click the triangle's bottom-right corner, then
   its top-left corner. Press Enter. This leaves a small triangle of four
   layers.
3. **Squash fold**. Click anywhere on the top flap. Its spine lands on the
   hinge line by default. Press Enter. The flap opens into a square.
4. **Turn over** (Model group).
5. **Squash fold**. Click the flap now on top and press Enter. This is the
   preliminary base: a square with its open corner (the paper's four corners)
   at the bottom right and its closed point at the top left.
6. **Precrease** (P), **Axiom 3: edge onto edge**. Click the bottom edge,
   then the diagonal crease (the centre line). Under Layers, click the
   **Flap 2** chip so only the top flap folds. Press Enter. This is the first
   kite crease.
7. **Precrease**, Axiom 3. Click the right edge, then the centre line. Leave
   out Flap 2 again and press Enter. This is the second kite crease.
8. **Precrease**, **Axiom 1: through two points**. Click where the first kite
   crease meets the left edge, then where the second meets the top edge.
   Fold every layer and press Enter. This is the line H.
9. **Petal fold**, Locate line **Existing crease**. Click the H precrease,
   then the kite between the two kite creases below H. Choose Direction
   Valley and press Enter.
10. **Turn over**.
11. **Precrease**, Axiom 3. Click the bottom edge, then the centre line, and
    press Enter. Only the top flap lies at this line.
12. **Precrease**, Axiom 3. Click the left edge, then the centre line, and
    press Enter. H is already creased through every layer.
13. **Petal fold**, Existing crease. Click H, then the kite below it, and
    press Enter. This is the bird base.

## swivel-fold.osf: one swivel, three ways

The swivel folds the flat square about a point placed by hand. This is
Beloch's swivel rabbit ear (research §5.3): a rabbit ear whose creases need
not bisect anything. You give the point and three creases, and the fourth is
one of the creases that let the paper lie flat. As in a rabbit ear, the
fourth crease folds the other way from the three, and it must lie across
from the paper that stays put, never beside it. The file has three branches
from the sheet, one per fourth crease. With step 1 on screen, switch between
them with the ↑ and ↓ beside "Branch 3 of 3" (the file opens on the last)
under the strip.

- **Branch 1.** Take the **Swivel fold** tool. Hold Option (Alt on Windows
  and Linux) and click halfway between the centre and the bottom edge: the
  point where the creases meet. The point must be off every crease, which is
  why it is placed with Option rather than snapped. Click the right edge's
  midpoint, the left edge's midpoint and the bottom edge's midpoint. Then
  click the lower left of the paper, the part that stays put. The window
  shows Fourth crease **1 of 3**, straight up the middle. Press Enter. The
  upper half folds over along it while the bottom swivels.
- **Branch 2.** Click card 0, then make the same four clicks, but click the
  upper left of the paper as the part that stays put. Fourth crease 1 of 3
  would lie beside that paper, so the window opens on **2 of 3**, toward the
  lower left: a rabbit ear stands up, leaning left. Press Enter.
- **Branch 3.** Make the same clicks as branch 2 and step **Fourth crease**
  with its › button to **3 of 3**, toward the lower right. This is the
  mirror image. Click the **Swivel fold** button. Enter would press › again
  while › has the focus.

No single paper that stays fits all three: each fourth crease lies beside one
part of the paper, so branch 1 keeps a different part still.

There are no precreases. A swivel's point must lie off every crease, so the
tool cuts its four creases fresh and cannot refold precreases through its
point. The classic swivel, whose point sits on a folded edge, is not one this
tool can make yet.

## crimp.osf: the bird's-head crimp, inside and outside

1. **Valley fold**, Axiom 2. Click the top-left corner, then the bottom-left
   corner. Press Enter. This is the book fold: a strip two layers thick, 1
   wide and ½ tall, with the fold along its top.
2. **Crimp**. Choose **Free line** on the rail; it sets the First line, and
   the Second line is Free line by default. Click the top edge at its middle,
   then the bottom edge 7/10 of the way along. That is the first line, where
   the strip turns in. Click the top edge 8/10 of the way along, then the
   bottom edge straight below it. That is the second line, where the strip
   turns back out. The window says **Only the inside crimp fits here** and
   picks Kind **Inside**. Press Enter. The end turns down, its paper tucked
   between the layers: a bird's head.
3. **Branch 2.** Click card 1 (the book fold) first, so that the next crimp
   starts a new branch. Take **Crimp**. Draw the first line from the top
   edge 7/10 of the way along down to the bottom edge's middle, and the
   second from the top edge 8/10 of the way along straight down. With the
   first line leaning this way, only the outside crimp fits, so Kind is
   **Outside**. Press Enter. The end turns up, its paper wrapped round the
   outside of the strip.

The kind is usually forced by the lines (research §5.2). Lines leaning one
way take only the inside crimp, and lines leaning the other way take only the
outside crimp. Two lines square to the fold take both. Lines that close in on
each other near the strip take neither, and the window says to draw them
closer to parallel.
