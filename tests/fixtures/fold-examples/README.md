# Fold examples

Four Ori Studio projects that show how the Fold workspace's petal fold,
swivel fold and crimp tools are used. Each was folded through the real tools
in a browser (clicks on the folded pane, keys, the tool window) and saved
with File ▸ Save, the native `.osf` project format. The petal fold's petal
steps and the whole swivel were folded again when those tools changed
(2026-10-12): the petal fold names its hinge by its two endpoints, and the
swivel is made by its edge. `swivel-on-edge.osf` was added the same day, for
the swivel whose creases meet on a folded edge. Open one with File ▸ Open
and the Fold workspace replays it. Step through the strip at the top to see
each step.

Every step's `note` field says which tool and which clicks made it. The Fold
workspace keeps notes but does not show them, so the click paths are repeated
below.
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
8. **Petal fold**. The window starts on **Select the hinge crease**; under
   **Hinge**, choose **Two endpoints** instead. Click where the first kite
   crease meets the left edge, then where the second meets the top edge:
   the hinge, drawn in the valley pen as you go. The fold creases the hinge
   itself, through the top layer only, so it needs no precrease. Then move
   the pointer below the hinge: the kite between the two kite creases lights
   up, with the hinge and the kite creases in their pens, and the window
   says the fold will crease the hinge. Click it, keep Direction Valley and
   press Enter.
9. **Turn over**.
10. **Precrease**, Axiom 3. Click the bottom edge, then the centre line, and
    press Enter. Only the top flap lies at this line.
11. **Precrease**, Axiom 3. Click the left edge, then the centre line, and
    press Enter.
12. **Petal fold**. Hinge stays on Two endpoints. Click where this side's
    two kite creases meet the flap's edges, then the kite below them, and
    press Enter. This is the bird base.

With a precrease through every layer along the hinge first (Precrease,
**Axiom 1: through two points**, the same two points), keep **Hinge crease**
and click that precrease instead: the fold then refolds it and creases
nothing itself. The bird base this file ends on has 20 faces rather than 24,
since each hinge is creased through the top layer alone.

## swivel-fold.osf: an edge swivelled onto a line, both ridges

A swivel as folders diagram it: *swivel this edge onto that line, pivoting
at this point*. You click the pivot, the edge that moves and the line it
lands on; the four creases are computed. They meet where the pivot sits
moved onto the line halfway between the edge and the line it lands on (one
of the two bisectors of the edge and that line), which the window draws as
a dot in place of the click. A rabbit ear is the swivel whose creases meet
at its triangle's incenter. The file precreases the diagonal, then has two
branches from it, one per ridge: the crease the paper rises along, folded
the other way from the other three. With step 2 on screen, switch between
them with the ↑ and ↓ beside "Branch 2 of 2" (the file opens on the last)
under the strip.

1. **Precrease** (P), **Axiom 2: point onto point**. Click the top-left
   corner, then the bottom-right corner. Press Enter. This is the diagonal
   from the bottom-left corner to the top-right, the line the edge will
   land on.
2. **Branch 1.** Take the **Swivel fold** tool. Hold Option (Alt on Windows
   and Linux) and click about four fifths of the way across and a third of
   the way up: the pivot. The pivot need not be a landmark, which is why it
   is placed with Option rather than snapped. Click the bottom edge, the
   edge that moves; only raw and folded edges light up under the pointer.
   Click the diagonal precrease, the line it lands on; the top edge, parallel
   to the bottom one, never lights. The window shows the dot where the
   creases meet, the four creases in their pens, where the edge lands on
   the diagonal in bold, and the paper that moves lit, the part that turns
   in place brightest. Ridge reads **Square to the edge**. Press Enter.
3. **Branch 2.** Click card 1 (the precrease) first, so that the next swivel
   starts a new branch. Make the same three clicks, then step **Ridge** with
   its › button to **Toward the edge’s end**: the paper rises along the
   crease to the bottom-right corner instead. Click the **Swivel fold**
   button. Enter would press › again while › has the focus.

Under **Lands on**, **Two points** names the line by two points clicked on
it instead of a crease or edge already there. A swivel stored by its rays
(the vertex and three points its creases run toward, the fourth computed,
and the paper that stays), as this file held before, still replays and
shows; the Swivel fold tool now makes a swivel by its edge.

## swivel-on-edge.osf: a squashed flap's edge swivelled onto the centre line

The classic swivel where the creases meet on a folded edge, after Abrashi's
"What is Swivel fold?" diagram. On a preliminary base with one flap squashed
into a kite, two valley folds meet at a point on the kite's upper-left edge.
One runs to the kite's right corner: the top layer folds up along it. The
other runs down to the bottom tip: the layers underneath swivel about the
tip, so the model's lower-left edge lies along the centre line. The kite's
upper-left edge unfolds where it is swivelled, and a third crease, a
mountain as seen from the front, lies along the second valley in the other
layer. The result is a
narrow triangle along the centre line at the bottom.

1. **Valley fold** (V), **Axiom 2: point onto point**. Click the bottom-left
   corner, then the top-right corner. Press Enter. The square folds on its
   diagonal.
2. **Precrease** (P), Axiom 2. Click the bottom-right corner, then the
   top-left corner. Press Enter: the other diagonal, creased and unfolded.
3. **Inside reverse fold**, Axiom 2. Click the triangle's bottom-right
   corner, then its right-angled corner (bottom left). The corner folds in
   between the layers onto it. Press Enter.
4. **Inside reverse fold**, Axiom 2. Click the top corner, then the
   right-angled corner (bottom left). Press Enter. This is the preliminary
   base, its closed point the sheet's centre.
5. **Rotate** (Model group): ⅛ of a turn counterclockwise, so the open
   corner points down. Press Enter.
6. **Squash fold**. Click the front flap on the right and press Enter. The
   flap opens into a kite on the centre line.
7. **Swivel fold**. Click the kite's upper-left edge, anywhere along it: a
   folded edge lights up under the pointer, with the point on it, and the
   creases will meet on it. Click the kite's lower-left edge, which is the
   model's lower-left edge: the edge that moves. Click the centre line: the
   line it lands on. The window shows a dot where the creases meet, where the
   line halfway between that edge and the centre line crosses the folded
   edge, with the creases in their pens and the paper that moves lit. Only
   **Valley** folds flat here, so Mountain is greyed out and no Ridge is
   offered: the ridge is the folded edge itself. Press Enter.

The stored step names the folded edge by `fold`, a point on it, in place of
a pivot and the paper that stays. An older build that does not know `fold`
locks the step rather than folding something else.

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
