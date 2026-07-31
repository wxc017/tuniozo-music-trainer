# Statics position renders

Generates the gymnastics-position images in `public/statics/` and the rigged
`public/models/gymnast.glb` the Statics tab orbits
(`src/components/tabs/StaticsTab.tsx` → `src/lib/staticsRenders.ts` →
`src/components/statics/GymnastPose3D.tsx`).

27 positions cover all 44 skills, because a skill's `chain` in
`src/lib/staticsData.ts` lists the positions it passes through and most skills
share them — every route into the cross reuses the same `iron_cross` render.

## Running it

Blender (5.2 LTS) must be open with the official **MCP** extension
(Blender Lab) listening on `127.0.0.1:9876`. The scripts talk to it over that
socket; there is no headless mode here.

```bash
python scripts/statics-render/render_all.py                 # all 27
python scripts/statics-render/render_all.py iron_cross maltese
python scripts/statics-render/export3.py                    # the .glb + rings3d.json
python scripts/statics-render/roundtrip.py l_sit maltese    # verify the .glb
```

The extension does **not** start its server unless autostart is on in its
preferences. If the socket refuses connections, launch Blender with:

```bash
blender --online-mode --python scripts/statics-render/start_mcp.py
```

## The figure

A textured Mixamo character (`Hanging Idle (1).fbx`, downloaded "with skin"):
9.5k-vert body, 4096² atlases, already rigged to the Mixamo skeleton the pose
solver drives. `charlib.build_character()` imports it, clears the animation it
ships posed in, scales it to 1.66 m (elite rings specialists are short — Chen
Yibing 1.61, Jovtchev 1.66, Petrounias 1.67) and drops the feet to z = 0.

It replaced an MPFB2 parametric human. MPFB's anatomy was correct and its
surface was not: no skin texture, no normal map, a mask for a face — and
everything that makes a 3D human read as human is surface. Three rounds of
"the model does not look human" ended when the figure got a real texture.

Things about this character that will bite you:

* **Every mesh shares one material and one atlas** — body, shirt, pants, shoes.
  And the body's own texture has a dark t-shirt painted into it. Stripping the
  shirt does not expose a torso, it exposes a painted one, with the sleeve edges
  left as dark bands round the upper arms. So the clothing meshes are kept and
  **recoloured** (`KIT_MESHES`); white trousers and a light top is the men's
  rings uniform anyway and reads far better against a dark background. Shoes go.
* **The bone prefix varies per export** — this file uses `mixamorig12:`, not
  `mixamorig:`. `detect_prefix()` reads it off the rig, and `gym.set_prefix()`
  **rebuilds every constant derived from it**. Forgetting that is silent, not
  fatal: the names stop matching, `auto_view` finds fewer than four landmarks
  and quietly returns its fallback direction, and all 27 positions come out
  framed from the same angle.
* **The FBX wires a Non-Color copy of the colour map into Alpha.** Cycles
  renders it opaque so it never shows; glTF reads it as a real alpha channel,
  exports the material as blended, and the skin comes back a mottled mess.
  `export3.py` cuts the link.

## Pose data

Each record in `poses.json` is a position, not a skill:

```jsonc
{
  "key": "planche",
  "body_up":    [-1, 0, 0],    // WORLD direction of the body's head-ward axis
  "body_front": [0, 0, -1],    // WORLD direction of the chest. ⟂ body_up
  "segments": {                // BODY-frame unit vectors, proximal → distal
    "upper_arm_L": [0.21, 0.5, -0.84],
    ...
  },
  "spine_curve": 5,            // degrees; + = hollow, − = arched
  "pelvic_tilt": 16,           // degrees of POSTERIOR tilt
  "scapula": 1.0,              // +1 protracted … −1 retracted
  "depression": 0.85,          // +1 depressed … −1 elevated
  "forearm_rot": 240           // degrees of roll; +180 turns supination to pronation
}
```

The body frame is anatomical: **+X = the character's own left, +Y = anterior,
+Z = superior**, and it rotates with the figure. So a front lever's arms are
authored as "anterior, square to the torso" and stay correct once `body_up`
lays the body flat — no mental rotation while authoring.

`segments` are aimed absolutely, so a straight-arm element is expressed by
making `forearm_L` identical to `upper_arm_L`; there is no elbow angle to get
wrong. Verified numerically: posed arm bones come out collinear to 0.00°.

`scapula`, `depression`, `pelvic_tilt` and `forearm_rot` are the form cues, and
they are first-class fields because they are what separates these skills: a
planche and a maltese are both "arms out, body level", and the difference is
maximal protraction against the retraction of a Victorian. The same numbers
drive the rig and the cue text in `staticsRenders.ts`, so the picture and the
words cannot drift apart.

## The grip

This took nine attempts. Do not "simplify" it back.

The first six built the finger chain out of geometry — tangent at each joint,
fixed anatomical angles, inscribing the knuckle's own circle, a circle fitted
through MCP/PIP/DIP, closing the fist and reading its tunnel. **Every one passed
its own arithmetic while looking wrong**, because each computation was
internally consistent. Only the renders showed the truth. Trust the picture.

What works instead: take the fist from an artist and solve one number.

1. `charlib` captures the finger rotations from the FBX's **own** animation,
   at the mid frame, before clearing it. Same rig in and out, so there is no
   rest-pose mismatch — applying Mixamo's quaternions to MPFB's re-creation of
   the Mixamo skeleton curled the fingers in a subtly wrong plane, which is why
   the fist looked plausible but never sat on the tube.
2. `gym.wrap_fingers(k, k_mcp)` scales that fist's flexion **along its own
   path**, knuckles separately from the finger joints. Scaling all three joints
   together only straightens the finger; to wrap something thicker than the
   artist's prop the knuckle must stay bent — that is what brings the finger
   round the far side — while the middle and tip joints open to widen the arc.
3. `gym.hold_spot()` finds where a bar can sit in that hand, on a grid in the
   plane across the palm. Two axes, both needed: along the palm normal because
   the bar stands off the skin, and along the hand's length because a bar is not
   held straight under the knuckles — it sits a little toward the fingertips,
   which is what lets the proximal phalanx pass down the FRONT of it.
4. `gym.fit_grip()` scans flexion from a hard fist outward and takes the
   tightest one whose skin still clears the ring's 28 mm stock.

Two guards, both of which exist because their absence produced a confident
wrong answer:

* **Enclosure.** Every candidate hold spot must have skin round it from nearly
  every direction. Without that test the search walks away from the hand, where
  distance-to-skin grows without bound, and reports open air beside the fist as
  a 35 mm tunnel — pinned to the edge of the search grid, three attempts running.
  A fist leaves a real gap between the fingertips and the thumb, so some gap is
  allowed (~250° of wrap is normal); half the circle is not.
* **A leash on any hill-climb.** An earlier unbounded ascent escaped through
  that same fingertip-to-thumb gap and looped forever. It hung Blender hard
  enough to need a kill and restart.

`palm_half()` samples a narrow strip under the knuckles, not the whole hand
group: the maximum over the whole palm picks up the thenar eminence and reports
29 mm where the palm is 14, which pushed the ring 3 cm past any finger's reach
and left the hand posed beside it.

## The apparatus

**FIG-dimensioned** — 18 cm bore, 2.8 cm stock, cables 50 cm apart. The cables
are *not* vertical: pulled apart into a cross they splay several degrees and the
rings tilt with them.

**The ring's orientation is not a free parameter.** A ring hangs from one strap,
so under load it turns until the attachment is straight above the hand. That
means the contact point IS the ring's lowest point, and the ring's plane holds
the vertical — which forces the tube's axis at the grip to be *horizontal*.
Horizontal *and* perpendicular to the forearm leaves exactly one direction,
`h × ẑ`. Nothing is left to choose.

Every earlier version treated this as an angle to dial in, and every one got it
wrong: the hand ended up clamped to the ring's side instead of resting on its
lowest part. The check that catches it is one line — the tube's tilt off
horizontal, which must be 0.0° for every pose.

One degenerate case: when the forearm hangs straight down (support, L-sit,
hang) every horizontal direction is perpendicular to it and the rule says
nothing. There the **anterior** axis decides, turning the ring into the sagittal
plane — edge-on from the front, which is how a cross and a support both look in
a photograph.

`ring_swing()` may then lean the ring up to **6°** off that to relieve the worst
overlap with the forearm. The limit is deliberately tight: an earlier version
was free to swing 75°, which cleared every arm and destroyed the thing that
actually matters. Where the forearm still touches, it touches — in a real
support the ring's upper arc rests against the forearm too.

## The arm roll

`set_grip_pose()` splits the roll between humerus and forearm (55/45), rotating
the humerus first and then **re-measuring** so the split costs no accuracy.
This rig has no twist bones — one `Arm`, one `ForeArm` — and a large roll put
entirely on the forearm collapses the mesh into an hourglass at the elbow.

The hand CONTINUES the forearm. An earlier version bent the wrist until the palm
faced the load, which cost 75–90° of extension and read as a snapped forearm.

## Pelvic tilt

Posterior pelvic tilt lives in the **lumbar spine**, not in the legs. Swinging
the leg targets under the pelvis reads as "hips pushed through" and breaks the
one thing a planche is judged on — a straight line from shoulder to ankle. What
the cue actually describes is the pelvis rolling under and the lumbar arch
flattening, while the body line stays straight.

It was also once applied with the wrong sign, which produced exactly the arched,
hips-up ANTERIOR tilt the cue exists to prevent. Measure it: the angle at the
hip between shoulder→hip and hip→ankle. A straight body reads ~12° on this rig
(the Hips bone head is not on the body line), so compare against `support`
rather than against zero.

## The camera

Chosen per pose, in Blender (`gym.auto_view`) and again in the viewer
(`GymnastPose3D.bestView`), by how much the skeleton spreads in the image plane
— **weighted by the worst-foreshortened limb**. Spread alone does not notice a
limb aimed at the lens: an L-cross scored best from dead front, where the legs
point at the camera and collapse into the hips, and the arms alone were spread
enough to win. Averaging the foreshortening over nine segments is not enough
either — two collapsed legs get outvoted, which is how a V-cross ended up filmed
straight down its own legs. Take the minimum.

## The 3D viewer (`export3.py`)

Exports one rigged `public/models/gymnast.glb` with **one animation clip per
position**, plus `public/statics/rings3d.json` for the ring/strap transforms
(the rings move per position, so they are not in the glb).
`GymnastPose3D.tsx` seeks a clip to t=0 and orbits it.

Every bug here looked fine in Blender and broke only on the way out, so
**verify against three.js, not against Blender**:

* **Body orientation must live on the `root` BONE, not the armature object.**
  The exporter emits per-bone channels but silently drops the armature OBJECT's
  own animation. Orienting via the object matrix exported clips that posed the
  limbs correctly and left every figure standing upright. `gym.orient_root()`
  exists for this; the still renders may use `orient()`, the export may not.
  (Verified equal: both paths give the same ring normal to three decimals.)
* **Export DIRECTIONS, never hand-converted quaternions.** Directions convert
  from Blender's Z-up to glTF's Y-up exactly like positions (`x, z, -y`). An
  earlier basis-change on the ring quaternion put the rings at the wrong angle,
  which read as the hands not gripping. The ring's `normal` and the strap's
  `dir` are vectors, and three rebuilds the rotation with `setFromUnitVectors`.
* **Build the clips with NLA evaluation OFF.** Stashing a finished pose as an
  NLA strip makes the NLA start evaluating it, so from pose 2 onward every
  `view_layer.update()` overwrote the pose bones with whatever the stacked
  strips produced. The Blender renders stayed correct — they never touch the
  NLA — while the exported clips were quietly contaminated.
* **Rescale the textures.** Seven 4096² atlases for a figure a few hundred
  pixels tall. 1024 px + JPEG keeps the glb at 2.7 MB.
* **Frame from the BONES, not `Box3.setFromObject`.** For a skinned mesh that
  returns the *bind-pose* bounds, identical for every clip — every pose reported
  a 2.41 m diagonal, so the camera framed a handstand exactly like an iron cross.

## Verifying

`roundtrip.py` imports the finished `gymnast.glb` back into Blender, applies
each clip, places the rings from `rings3d.json`, and renders a PNG. Use it — it
exercises exactly what three.js consumes and, unlike a browser, leaves an image
on disk you can look at. Every export bug above was invisible in the Blender
scene and obvious in a round-trip render.

Note the Blender-side "knuckle→tube" print is a TAUTOLOGY when the contact point
is *defined* as knuckle + offset. The checks that can actually fail are the ones
against the mesh: `fit_grip` reports finger-skin clearance, and it is allowed to
report a negative number.
