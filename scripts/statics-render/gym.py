"""Posing + gripping the MPFB gymnast, on the MIXAMO skeleton.

Rigged `mixamo` rather than MPFB's `default` so that a hand pose lifted from a
Mixamo animation ("Pull Up", "Hanging Idle", "Climbing") drops straight on: the
bone names are identical, so there is no retargeting step and no name map to get
wrong. That matters because the grip is the one thing repeated attempts to solve
analytically failed at — every construction either curled the fingers through
the ring or closed them into a fist beside it. A grip is one artist-authored
pose, reused everywhere; `GRIP_POSE` below is where it goes.

The Mixamo skeleton is also simpler than MPFB's default: 52 bones, no twist-bone
pairs (one `Arm`, not `upperarm01`+`upperarm02`), and no metacarpals — the
knuckle line comes from the proximal phalanges instead.
"""

GYM = r'''
import bpy, math, json, os
import numpy as np
from mathutils import Vector, Matrix, Quaternion

MX = "mixamorig:"          # replaced at build time; Mixamo exports vary the
def set_prefix(p):         # suffix ("mixamorig12:" in the file we use)
    """Set the bone-name prefix AND rebuild everything derived from it.

    The constants below are spelled out at import time, when the prefix is still
    the default. Forgetting to refresh them is silent, not fatal: the names just
    stop matching, `auto_view` finds fewer than four landmarks and quietly
    returns its fallback direction — so every one of 27 positions was framed
    from the same angle and the per-pose camera looked like it had regressed."""
    global MX, ROOT, SPINE, NECKB, HEADB, VIEW_MARKS
    MX = p
    ROOT = B("Hips")
    SPINE = [B("Spine"), B("Spine1"), B("Spine2")]
    NECKB = [B("Neck")]
    HEADB = B("Head")
    VIEW_MARKS = [HEADB, ROOT] + SPINE + [
        B(sd + n) for sd in ("Left", "Right")
        for n in ("Arm", "ForeArm", "Hand", "UpLeg", "Leg", "Foot", "ToeBase")]

def B(n):
    return MX + n

def S(side):
    return "Left" if side == "L" else "Right"

# Hips is the root; Spine chain runs UPWARD from it (unlike MPFB's default rig,
# whose spine is parented downward).
ROOT = B("Hips")
SPINE = [B("Spine"), B("Spine1"), B("Spine2")]
NECKB = [B("Neck")]
HEADB = B("Head")

FINGER_NAMES = {1: "Thumb", 2: "Index", 3: "Middle", 4: "Ring", 5: "Pinky"}
def fbone(side, f, j):
    return B(S(side) + "Hand" + FINGER_NAMES[f] + str(j))

def SEG_BONES(side):
    s = S(side)
    return {
        "upper_arm_" + side: [B(s + "Arm")],
        "forearm_" + side:   [B(s + "ForeArm")],
        "hand_" + side:      [B(s + "Hand")],
        "thigh_" + side:     [B(s + "UpLeg")],
        "shin_" + side:      [B(s + "Leg")],
        "foot_" + side:      [B(s + "Foot")],
    }

# ── anatomical body frame → Blender ──────────────────────────────────────────
# Authored data uses +X = the character's LEFT, +Y = ANTERIOR, +Z = SUPERIOR.
# The mesh faces −Y in Blender, so anterior maps to −Y.
def anat(v):
    return Vector((v[0], -v[1], v[2])).normalized()

def bdir(rig, name):
    pb = rig.pose.bones[name]
    return (rig.matrix_world.to_3x3() @ Vector(pb.tail - pb.head)).normalized()

def aim_world(rig, name, target):
    """Point a pose bone along `target`, given in WORLD space."""
    pb = rig.pose.bones.get(name)
    if pb is None:
        return
    inv = rig.matrix_world.inverted().to_3x3()
    tgt = (inv @ Vector(target)).normalized()
    cur = (pb.tail - pb.head).normalized()
    q = cur.rotation_difference(tgt)
    head = pb.head.copy(); m = pb.matrix.copy()
    pb.matrix = (Matrix.Translation(head) @ q.to_matrix().to_4x4()
                 @ Matrix.Translation(-head) @ m)
    bpy.context.view_layer.update()

def rotate_world(rig, name, axis_world, angle):
    """Spin a bone about a world axis through its own head — a twist about the
    bone's own axis, which `aim` cannot express."""
    pb = rig.pose.bones.get(name)
    if pb is None:
        return
    inv = rig.matrix_world.inverted().to_3x3()
    q = Quaternion((inv @ Vector(axis_world)).normalized(), angle)
    head = pb.head.copy(); m = pb.matrix.copy()
    pb.matrix = (Matrix.Translation(head) @ q.to_matrix().to_4x4()
                 @ Matrix.Translation(-head) @ m)
    bpy.context.view_layer.update()

def reset_pose(rig):
    bpy.context.view_layer.objects.active = rig
    if rig.mode != 'POSE':
        bpy.ops.object.mode_set(mode='POSE')
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)
    bpy.ops.object.mode_set(mode='OBJECT')
    rig.matrix_world = Matrix.Identity(4)
    bpy.context.view_layer.update()

def _place(body_up, body_front):
    U = Vector(body_up).normalized()
    F = Vector(body_front).normalized()
    F = (F - U * F.dot(U)).normalized()
    Lf = U.cross(F)
    return Matrix(((Lf.x, -F.x, U.x),
                   (Lf.y, -F.y, U.y),
                   (Lf.z, -F.z, U.z))).to_4x4()

def orient(rig, body_up, body_front):
    """Place the posed figure in the world via the armature's own transform.
    Columns are the world images of the Blender body axes: +X = character left,
    +Y = posterior, +Z = superior."""
    rig.matrix_world = _place(body_up, body_front)
    bpy.context.view_layer.update()

def orient_root(rig, body_up, body_front):
    """Same placement, carried by the ROOT BONE — required for glTF export,
    which emits per-bone channels but drops the armature object's own
    animation. Call only after apply_pose()."""
    q = _place(body_up, body_front).to_quaternion()
    if abs(q.angle) > 1e-9:
        rotate_world(rig, ROOT, q.axis, q.angle)

# ── shoulder girdle ──────────────────────────────────────────────────────────
# What separates these skills is the girdle far more than the arm angle: a
# planche and a maltese are both "arms out, body level", and the difference is
# maximal protraction versus the retraction of a Victorian.
PROTRACT_DEG = 17.0
DEPRESS_DEG = 13.0

def shoulder_girdle(rig, side, scapula, depression):
    W3 = rig.matrix_world.to_3x3()
    sup = W3 @ Vector((0, 0, 1))
    ant = W3 @ Vector((0, -1, 0))
    s = 1.0 if side == "L" else -1.0
    b = B(S(side) + "Shoulder")
    if b in rig.pose.bones:
        rotate_world(rig, b, sup, -s * math.radians(PROTRACT_DEG) * scapula)
        rotate_world(rig, b, ant, -s * math.radians(DEPRESS_DEG) * depression)

def apply_pose(rig, pose):
    reset_pose(rig)
    segs = pose["segments"]

    curve = math.radians(pose.get("spine_curve", 0.0))
    lumbar = math.radians(float(pose.get("pelvic_tilt", 0.0)))
    share = {SPINE[0]: 0.38, SPINE[1]: 0.36, SPINE[2]: 0.26}
    extra = {SPINE[0]: 0.60, SPINE[1]: 0.30, SPINE[2]: 0.10}
    for name in SPINE:
        rotate_world(rig, name, Vector((1, 0, 0)),
                     -(curve * share[name] + lumbar * extra[name]))

    scap = float(pose.get("scapula", 0.0))
    depr = float(pose.get("depression", 0.0))
    # POSTERIOR pelvic tilt lives in the LUMBAR SPINE, not in the legs.
    # Swinging the leg targets under the pelvis reads as "hips pushed through"
    # and breaks the one thing a planche is judged on — a straight line from
    # shoulder to ankle. What the cue actually describes is the pelvis rolling
    # under and the lumbar arch flattening, while the body line stays straight.
    # So it is added to the lowest spine segment and the legs are left alone.
    tilt = math.radians(float(pose.get("pelvic_tilt", 0.0)))

    for side in ("L", "R"):
        ua = segs.get("upper_arm_" + side)
        if ua:
            d = rig.matrix_world.to_3x3() @ anat(ua)
            cb = B(S(side) + "Shoulder")
            if cb in rig.pose.bones:
                rest = bdir(rig, cb)
                q = Quaternion().slerp(rest.rotation_difference(d), 0.18)
                rotate_world(rig, cb, q.axis, q.angle)
        shoulder_girdle(rig, side, scap, depr)

        for seg in ("upper_arm_", "forearm_", "hand_", "thigh_", "shin_", "foot_"):
            key = seg + side
            if key not in segs:
                continue
            d = rig.matrix_world.to_3x3() @ anat(segs[key])
            for b in SEG_BONES(side)[key]:
                aim_world(rig, b, d)

    if "head" in segs:
        d = rig.matrix_world.to_3x3() @ anat(segs["head"])
        for b in NECKB + [HEADB]:
            aim_world(rig, b, d)
    bpy.context.view_layer.update()

# ── apparatus ────────────────────────────────────────────────────────────────
# FIG: ring inside diameter 18 cm, stock 2.8 cm, cables 50 cm apart.
R_MAJOR, R_TUBE = 0.104, 0.014
ANCHOR_HALF, CABLE_UP = 0.25, 2.6
FINGER_FLESH = 0.011

def hand_frame(rig, side):
    """{wrist, knuckle-line midpoint, h, across, palm normal}.

    The Mixamo skeleton has no metacarpals, so the knuckle line comes from the
    proximal phalanges (Index1 … Pinky1) rather than metacarpal tails."""
    W = rig.matrix_world
    wrist = W @ rig.pose.bones[B(S(side) + "Hand")].head
    kn = [W @ rig.pose.bones[fbone(side, f, 1)].head
          for f in (2, 3, 4, 5) if fbone(side, f, 1) in rig.pose.bones]
    mid = sum(kn, Vector((0, 0, 0))) / len(kn)
    h = (mid - wrist).normalized()
    a = (kn[-1] - kn[0]).normalized()
    n = h.cross(a)
    n = n.normalized() if n.length > 1e-6 else Vector((0, 0, 1))
    thumb = rig.pose.bones.get(fbone(side, 1, 3))
    if thumb is not None and (W @ thumb.tail - mid).dot(n) < 0:
        n = -n
    return wrist, mid, h, a, n

def anchor_frame(rig):
    gl = hand_frame(rig, "L")[1]
    gr = hand_frame(rig, "R")[1]
    sep = gl - gr; sep.z = 0
    sep = sep.normalized() if sep.length > 1e-3 else Vector((1, 0, 0))
    mid = (gl + gr) / 2
    base = Vector((mid.x, mid.y, max(gl.z, gr.z) + CABLE_UP))
    return {"L": base + sep * ANCHOR_HALF, "R": base - sep * ANCHOR_HALF}

def tube_frame(rig, body, side, anch=None, support=False):
    """Where the ring's tube crosses this palm, and which way the circle goes.

    The ring's centre is ALWAYS on the cable side: the strap pulls up from the
    ring's top, so a hand can only ever wrap the arc nearest it — the bottom —
    with the circle rising toward the anchor. In support that still holds; the
    circle simply comes up around the wrist."""
    if anch is None:
        anch = anchor_frame(rig)
    wrist, mid, hh, a, pn = hand_frame(rig, side)
    h = bdir(rig, B(S(side) + "ForeArm"))

    # the tube runs across the palm — the axis the fingers curled about
    t = a - h * a.dot(h)
    t = t.normalized() if t.length > 1e-4 else a.normalized()

    # The tube rests ON the palm, under the knuckles: the bar's centreline sits
    # one tube-radius off the palm's surface. Deriving it from the posed fingers
    # instead sounds better and is not — a fist's own tunnel is whatever prop the
    # animation was authored around, and reading it back makes the ring inherit
    # that prop's diameter. Fix the ring at its real size here and make the
    # FINGERS give way, in fit_grip().
    n2 = pn
    ph = palm_half(rig, body, side, mid, n2, t, hh)
    # `contact` is the CENTRELINE, so it stands off the palm by a tube radius —
    # the tube's near surface then just kisses the skin.
    contact = mid + n2 * (ph + R_TUBE)

    u = (anch[side] - contact).normalized()
    c = u - t * u.dot(t)
    c = c.normalized() if c.length > 1e-4 else n2.copy()
    return contact, t, n2, u, h, c

def palm_half(rig, body, side, mid, n, t=None, h=None):
    """Distance from the knuckle line to the palm surface, straight below it.

    Sampled in a narrow strip under the knuckles, NOT over the whole hand group.
    Taking the maximum over the whole palm picks up the thenar eminence — the
    muscle at the base of the thumb — and reports 29 mm where the palm is 12,
    which pushed the ring 3 cm past any finger's reach and left the hand posed
    beside it."""
    grp = body.vertex_groups.get(B(S(side) + "Hand"))
    if grp is None:
        return 0.012
    gi = grp.index
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg)
    me = ev.to_mesh()
    MW = body.matrix_world
    best = 0.008
    src = body.data.vertices
    for i, v in enumerate(me.vertices):
        if i >= len(src):
            break
        for g in src[i].groups:
            if g.group == gi and g.weight > 0.4:
                d = MW @ v.co - mid
                if ((t is None or abs(d.dot(t)) < 0.030)
                        and (h is None or abs(d.dot(h)) < 0.018)):
                    best = max(best, d.dot(n))
                break
    ev.to_mesh_clear()
    return best

def set_grip_pose(rig, side, support=False, yaw_deg=0.0, body_axis=None):
    """Roll the arm so the palm faces the tube.

    With `body_axis`, the roll is SOLVED rather than dialled in: the ring is
    turned out until its plane holds the body's long axis — the RTO cue, "in
    line with the body". The ring's plane is spanned by the tube's axis across
    the palm and the pull toward the cable, so putting the body's line in that
    plane means putting the tube's axis along it, and the palm normal is then
    just h x L. Dialling this in by eye is what it replaces, and a hand-picked
    angle was up to 200 degrees out on the maltese and the Victorian.

    The hand CONTINUES the forearm — an earlier version bent the wrist until the
    palm faced the load, which cost 75-90 degrees of extension and read as a
    snapped forearm.

    The roll is SPLIT between the humerus and the forearm. This rig has no twist
    bones — one `Arm`, one `ForeArm` — so a large roll put entirely on the
    forearm collapses the mesh into an hourglass at the elbow. Splitting it is
    also what a real arm does: the shoulder supplies the rotation, the
    radioulnar joint the rest. Rotate the humerus first, then RE-MEASURE and
    give the forearm only what is left, so the split costs no accuracy."""
    h = bdir(rig, B(S(side) + "ForeArm"))
    up = Vector((0, 0, 1))
    n2 = None
    if body_axis is not None:
        # A ring hangs from one strap. Under load it turns until the strap's
        # attachment is straight above the hand, so the contact IS the ring's
        # lowest point and the ring's plane HOLDS THE VERTICAL. That forces the
        # tube's axis at the grip to be horizontal — and horizontal, while also
        # perpendicular to the forearm, leaves exactly one direction: h x z.
        # There is no angle left to choose, which is the point. Every earlier
        # version treated this as a free parameter and got it wrong.
        tt = h.cross(up)
        if tt.length < 0.30:
            # Forearm hanging straight down — a support, an L-sit, a hang.
            # Every horizontal direction is perpendicular to it, so the rule
            # says nothing and the ANTERIOR axis decides: the ring turns into
            # the sagittal plane, edge-on from the front, which is how a cross
            # and a support both actually look.
            tt = Vector(body_axis[1]); tt.z = 0.0
            tt = tt - h * tt.dot(h)
        if tt.length > 0.20:
            n2 = h.cross(tt.normalized()).normalized()
            if (n2.dot(up) > 0.0) == bool(support):
                n2 = -n2
    if n2 is None:
        n2 = up - h * up.dot(h)
        if n2.length < 0.30:
            return
        n2 = (-n2 if support else n2).normalized()
    if abs(yaw_deg) > 1e-6:
        sgn = 1.0 if side == "L" else -1.0
        n2 = (Quaternion(h, math.radians(yaw_deg) * sgn) @ n2).normalized()

    def roll_err(axis):
        """How far the palm still is from n2, measured about `axis`."""
        pn = hand_frame(rig, side)[4]
        A = pn - axis * pn.dot(axis)
        Bv = n2 - axis * n2.dot(axis)
        if A.length < 1e-4 or Bv.length < 1e-4:
            return 0.0
        A.normalize(); Bv.normalize()
        return math.atan2(A.cross(Bv).dot(axis), A.dot(Bv))

    ub = B(S(side) + "Arm")
    if ub in rig.pose.bones:
        ua = bdir(rig, ub)
        rotate_world(rig, ub, ua, roll_err(ua) * 0.55)
    fb = B(S(side) + "ForeArm")
    if fb in rig.pose.bones:
        h = bdir(rig, fb)
        rotate_world(rig, fb, h, roll_err(h))

# ── the grip ────────────────────────────────────────────────────────────────
# A grip is ONE pose, identical in every skill — it does not want a solver.
# Five analytical constructions were tried and all failed (fingers spiralled
# through the ring, or closed into a fist beside it). GRIP_POSE holds the
# finger rotations lifted from a Mixamo hanging/pull-up animation, whose bone
# names match this rig exactly. Until that file exists the hand stays open,
# which is at least honest about the state.
GRIP_POSE_FILE = r"C:/Tunizo/App/scripts/statics-render/grip_pose.json"
_GRIP_CACHE = {}

def load_grip_pose(path=None):
    """{bone_suffix: [w,x,y,z]} of finger rotations, mirrored per side."""
    path = path or GRIP_POSE_FILE
    if path in _GRIP_CACHE:
        return _GRIP_CACHE[path]
    data = None
    if os.path.exists(path):
        with open(path) as fh:
            data = json.load(fh)
    _GRIP_CACHE[path] = data
    return data

GRIP = {}                  # {bone suffix: [w,x,y,z]}, set by build_character

def wrap_fingers(rig, body, side, support=False, frame=None, grip=None,
                 k=1.0, k_mcp=1.0):
    """Apply the grip captured from the character's own animation.

    Taken from the SAME rig it will be applied to, so there is no rest-pose
    mismatch: a quaternion is relative to its bone's rest matrix, and MPFB's
    re-creation of the Mixamo skeleton does not have bit-identical rest poses,
    which left the fingers curling in a slightly wrong plane."""
    grip = grip if grip is not None else (GRIP or load_grip_pose())
    if not grip:
        return False
    for f in FINGER_NAMES:
        for j in (1, 2, 3):
            suffix = "Hand" + FINGER_NAMES[f] + str(j)
            q = grip.get(suffix)
            pb = rig.pose.bones.get(B(S(side) + suffix))
            if q is None or pb is None:
                continue
            # mirror across the midline for the right hand
            qq = Quaternion(q)
            if side == "R":
                qq = Quaternion((qq.w, qq.x, -qq.y, -qq.z))
            # k scales the whole fist's flexion along its own path: k<1 opens
            # the hand, k>1 closes it harder, and the SHAPE — which the artist
            # got right and five solvers did not — is preserved either way.
            # Knuckle and finger joints scale separately. Scaling all three
            # together only straightens the finger: to wrap something THICKER
            # than the artist's prop, the knuckle has to stay bent — that is
            # what brings the finger round the far side — while the middle and
            # tip joints open out to widen the arc.
            kj = k_mcp if j == 1 else k
            if abs(kj - 1.0) > 1e-6:
                # scale the joint's own rotation ANGLE — slerp refuses k > 1
                ax, ang = qq.axis, qq.angle
                if ang > math.pi:
                    ang -= 2 * math.pi
                qq = Quaternion(ax, ang * kj)
            pb.rotation_mode = 'QUATERNION'
            pb.rotation_quaternion = qq
    bpy.context.view_layer.update()
    return True

# ── the tunnel a closed fist forms ───────────────────────────────────────────
_HANDV = {}

def hand_verts(rig, body, side):
    """Indices of the mesh vertices that belong to this hand — the skin that
    has to clear the ring's tube. Cached: vertex weights never change."""
    ck = (body.name, side)
    if ck in _HANDV:
        return _HANDV[ck]
    want = {B(S(side) + "Hand")}
    for f in FINGER_NAMES:
        for j in (1, 2, 3):
            want.add(B(S(side) + "Hand" + FINGER_NAMES[f] + str(j)))
    gi = {vg.index for vg in body.vertex_groups if vg.name in want}
    out = []
    if gi:
        for v in body.data.vertices:
            if sum(g.weight for g in v.groups if g.group in gi) > 0.5:
                out.append(v.index)
    _HANDV[ck] = out
    return out

def _hand_pts(body, idx):
    """Hand skin in world space. numpy throughout: fitting the grip evaluates
    min-distance-to-ring a dozen times per hand per pose, and in plain Python
    that alone took minutes."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg)
    me = ev.to_mesh()
    n = len(me.vertices)
    co = np.empty(n * 3, dtype=np.float64)
    me.vertices.foreach_get("co", co)
    co = co.reshape(n, 3)
    ev.to_mesh_clear()
    idx = np.asarray([i for i in idx if i < n], dtype=np.int64)
    if not len(idx):
        return np.zeros((0, 3))
    M = np.array(body.matrix_world)
    v = co[idx]
    return v @ M[:3, :3].T + M[:3, 3]

def finger_verts(rig, body, side):
    """Vertices on the PHALANGES only. The palm is excluded on purpose: it is
    supposed to rest on the tube, so including it would peg the fit at whatever
    the palm already touches and the fingers would never be measured."""
    ck = (body.name, side, "fing")
    if ck in _HANDV:
        return _HANDV[ck]
    want = set()
    for f in FINGER_NAMES:
        for j in (1, 2, 3):
            want.add(B(S(side) + "Hand" + FINGER_NAMES[f] + str(j)))
    gi = {vg.index for vg in body.vertex_groups if vg.name in want}
    out = []
    if gi:
        for v in body.data.vertices:
            if sum(g.weight for g in v.groups if g.group in gi) > 0.5:
                out.append(v.index)
    _HANDV[ck] = out
    return out

def ring_gap(pts, centre, normal, R=None):
    """Closest approach between a point set and the ring's TUBE CENTRELINE.

    Measured against the circle rather than a straight axis: over the 6 cm of
    ring a hand touches, the arc departs from its tangent by about 4 mm, which
    is a third of the tube's radius — enough to turn a clean grip into a
    visible intersection."""
    if R is None:
        R = R_MAJOR
    if not len(pts):
        return 1.0
    C = np.array(centre); N = np.array(normal, dtype=np.float64)
    N /= np.linalg.norm(N)
    v = pts - C
    along = v @ N
    radial = np.linalg.norm(v - np.outer(along, N), axis=1) - R
    return float(np.sqrt(radial * radial + along * along).min())

def hold_spot(rig, body, side, mid, n, h, t, pts, span=0.024, step=0.002,
              max_gap=115.0):
    """Where a bar can sit in THIS hand, searched in the plane across the palm.

    Two axes, both needed. Along the palm normal because the bar stands off the
    skin; along the hand's length because a bar is not held straight under the
    knuckles — it sits a little toward the fingertips, which is what lets the
    proximal phalanx pass down the FRONT of it rather than through it.

    Every candidate must be ENCLOSED: skin has to come round it from nearly
    every direction. Without that test the search simply walks away from the
    hand, where distance-to-skin grows without limit, and reports open air
    beside the fist as a 35 mm tunnel — which is what it did, pinned to the edge
    of the grid, three attempts running. A fist leaves a real gap between the
    fingertips and the thumb, so some gap is allowed; half the circle is not."""
    N = np.array(n); H = np.array(h); T = np.array(t)
    E1 = np.cross(T, N); E1 /= np.linalg.norm(E1)     # in-plane, along the hand
    S = np.array(mid) + N * 0.028
    m = int(span / step)
    sub = pts[::3] if len(pts) > 900 else pts         # enough for a gap test
    best = (-1.0, Vector(S), 360.0)
    for i in range(-m, m + 1):
        for j in range(-m, m + 1):
            c = S + N * (i * step) + H * (j * step)
            d = pts - c
            r = float(np.sqrt((d * d).sum(1)).min())
            if r <= best[0]:
                continue
            w = sub - c
            ang = np.sort(np.arctan2(w @ N, w @ E1))
            gap = float(np.diff(np.concatenate([ang, ang[:1] + 2 * np.pi])).max())
            if math.degrees(gap) <= max_gap:
                best = (r, Vector(c), math.degrees(gap))
    return best[1], best[0], best[2]

def arm_verts(rig, body, side):
    """Forearm + upper arm skin. The limb the ring has to clear."""
    ck = (body.name, side, "arm")
    if ck in _HANDV:
        return _HANDV[ck]
    want = {B(S(side) + "ForeArm"), B(S(side) + "Arm")}
    gi = {vg.index for vg in body.vertex_groups if vg.name in want}
    out = []
    if gi:
        for v in body.data.vertices:
            if sum(g.weight for g in v.groups if g.group in gi) > 0.6:
                out.append(v.index)
    _HANDV[ck] = out
    return out

def ring_swing(rig, body, side, contact, t, u, clear=0.010, limit=6.0, step=2.0):
    """Rotate the ring on its own tangent until it stops cutting into the arm.

    In a support the forearm rises through the ring, which is right — but the
    ring's plane also contains the forearm, so its top arc lands exactly where
    the forearm is and the two intersect. Swinging the ring about the tube axis
    keeps the grip untouched (the tangent at the hand does not move) and takes
    the far side of the ring off the arm. Real rings lean like this under load,
    so the smallest swing that clears is both the least intrusive fix and the
    honest one."""
    c0 = u - t * u.dot(t)
    if c0.length < 1e-4:
        return u.copy()
    c0.normalize()
    pts = _hand_pts(body, arm_verts(rig, body, side))
    if not len(pts):
        return c0
    target = R_TUBE + clear
    best = (-1.0, c0)
    n = int(limit / step)
    for i in range(n + 1):                 # smallest swing first, both ways
        for sgn in ((1, -1) if i else (1,)):
            c = (Quaternion(t, math.radians(i * step * sgn)) @ c0).normalized()
            g = ring_gap(pts, contact + c * R_MAJOR, t.cross(c).normalized())
            if g >= target:
                return c
            if g > best[0]:
                best = (g, c)
    return best[1]

def fit_grip(rig, body, side, mid, n, h, t, lo=0.35, hi=1.30, step=0.05,
             clear=0.0012):
    """Close the fist as hard as the ring's 28 mm stock allows, and put the ring
    where that fist can actually hold it.

    Every earlier attempt built the finger chain out of geometry, and every one
    passed its own arithmetic while looking wrong. This keeps the artist's fist
    — the only thing here that has ever looked like a hand — and solves two
    things against the real mesh: how far to close it, and where the bar then
    sits. Skin distance is the objective because skin is what the eye judges,
    so a fit cannot pass while a finger is inside the ring.

    The knuckles stay at the artist's flexion throughout; only the middle and
    tip joints open, which is how a hand takes a thicker bar."""
    idx = hand_verts(rig, body, side)
    target = R_TUBE + clear
    n = n.normalized(); h = h.normalized(); t = t.normalized()

    def probe(k):
        wrap_fingers(rig, body, side, k=k)
        return hold_spot(rig, body, side, mid, n, h, t, _hand_pts(body, idx))

    # scan from a hard fist outward: the tightest grip the ring's stock allows
    ks = [hi - i * step for i in range(int((hi - lo) / step) + 1)]
    for k in ks:
        ctr, r, gap = probe(k)
        if r >= target:
            return k, ctr, r, gap
    k = max(ks, key=lambda kk: probe(kk)[1])
    ctr, r, gap = probe(k)
    return k, ctr, r, gap


# ── camera ───────────────────────────────────────────────────────────────────
VIEW_MARKS = [HEADB, ROOT] + SPINE + [
    B(s + n) for s in ("Left", "Right")
    for n in ("Arm", "ForeArm", "Hand", "UpLeg", "Leg", "Foot", "ToeBase")]

def auto_view(rig, elevations=(-10.0, 0.0, 10.0, 20.0, 30.0), step=10.0):
    """Pick the camera direction that shows the pose most openly. A fixed front
    camera looks straight down an L-sit's legs and down a maltese's arms."""
    W = rig.matrix_world
    pts = [W @ rig.pose.bones[b].head for b in VIEW_MARKS if b in rig.pose.bones]
    if len(pts) < 4:
        return -14.0, 4.0
    # limb directions, for the foreshortening term
    segs = []
    for sd in ("Left", "Right"):
        for b1, b2 in (("Arm", "ForeArm"), ("ForeArm", "Hand"),
                       ("UpLeg", "Leg"), ("Leg", "Foot")):
            n1, n2 = B(sd + b1), B(sd + b2)
            if n1 in rig.pose.bones and n2 in rig.pose.bones:
                d = (W @ rig.pose.bones[n2].head) - (W @ rig.pose.bones[n1].head)
                if d.length > 1e-4:
                    segs.append(d.normalized())
    if ROOT in rig.pose.bones and HEADB in rig.pose.bones:
        d = (W @ rig.pose.bones[HEADB].head) - (W @ rig.pose.bones[ROOT].head)
        if d.length > 1e-4:
            segs.append(d.normalized())

    best, score = (-14.0, 4.0), -1.0
    a = 0.0
    while a < 360.0:
        for e in elevations:
            ar, er = math.radians(a), math.radians(e)
            v = Vector((-math.sin(ar) * math.cos(er),
                        math.cos(ar) * math.cos(er), -math.sin(er)))
            right = v.cross(Vector((0, 0, 1)))
            if right.length < 1e-6:
                continue
            right.normalize()
            up = right.cross(v).normalized()
            xs = [p.dot(right) for p in pts]
            ys = [p.dot(up) for p in pts]
            mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
            sxx = sum((x - mx) ** 2 for x in xs) / len(xs)
            syy = sum((y - my) ** 2 for y in ys) / len(ys)
            sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / len(xs)
            tr, det = sxx + syy, sxx * syy - sxy * sxy
            disc = max(0.0, tr * tr / 4 - det)
            l1, l2 = tr / 2 + math.sqrt(disc), tr / 2 - math.sqrt(disc)
            s = math.sqrt(max(l1, 0.0) * max(l2, 0.0))
            # Overall spread alone does not notice a LIMB aimed at the lens: an
            # L-cross scored best from dead front, where the legs stick straight
            # at the camera and collapse into the hips, and the arms alone were
            # spread enough to win. Weight by how much of each limb survives the
            # projection, so a view that foreshortens one is rejected however
            # well it shows the rest.
            # the WORST-foreshortened limb, not the average: averaging over
            # nine segments lets two collapsed legs be outvoted by the arms,
            # which is how a V-cross ended up filmed straight down its own legs
            f = min((math.sqrt(max(0.0, 1.0 - d.dot(v) ** 2)) for d in segs),
                    default=1.0)
            s *= max(0.10, f)
            s *= (1.0 - 0.0016 * abs(e)) * (1.0 + 0.10 * math.cos(ar))
            if s > score:
                score, best = s, (a, e)
        a += step
    az, el = best
    if az > 180.0:
        az -= 360.0
    return az, el
'''
