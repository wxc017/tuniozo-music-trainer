"""Pull a closed-hand pose out of a Mixamo FBX and save it as grip_pose.json.

    python scripts/statics-render/extract_grip.py <animation.fbx> [frame]

Why this exists: a grip is ONE pose, identical in an iron cross and an L-sit, and
five attempts to derive it analytically all failed — the fingers either spiralled
through the ring or closed into a fist beside it. An artist already solved this
inside every Mixamo hanging/climbing animation, and MPFB's `mixamo` rig uses the
same bone names, so the rotations transfer with no retargeting.

Good sources on mixamo.com (any character; only the skeleton matters):
    "Pull Up", "Hanging Idle", "Climbing", "Monkey Bars", "Rope Climbing"
Download as **FBX**, any settings — only the finger rotations are read.

Pick a frame where the hand is closed on the bar. Mid-animation is usually safe;
frame 0 of a pull-up already has the hands gripping.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blender  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "grip_pose.json")

# The four fingers plus the thumb, three phalanges each. Stored by SUFFIX
# ("HandIndex1"), so the same record applies to either hand.
FINGERS = ("Thumb", "Index", "Middle", "Ring", "Pinky")

CODE = r'''
import bpy, json
from mathutils import Quaternion

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for c in (bpy.data.actions, bpy.data.armatures, bpy.data.meshes):
    for d in list(c):
        c.remove(d)

bpy.ops.import_scene.fbx(filepath=r"__FBX__", automatic_bone_orientation=True)
rig = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
if rig is None:
    raise RuntimeError("no armature in that FBX")

names = [b.name for b in rig.data.bones]
print("armature:", rig.name, "bones:", len(names))
hand = [n for n in names if "Hand" in n and any(f in n for f in __FINGERS__)]
if not hand:
    raise RuntimeError("no Mixamo finger bones found; sample: %s" % names[:8])
prefix = hand[0].split("Left")[0] if "Left" in hand[0] else ""
print("prefix:", repr(prefix), " finger bones:", len(hand))

sc = bpy.context.scene
frame = __FRAME__
if frame is None:
    frame = int((sc.frame_start + sc.frame_end) / 2)
sc.frame_set(frame)
bpy.context.view_layer.update()
print("frame %d of %d..%d" % (frame, sc.frame_start, sc.frame_end))

out = {}
for f in __FINGERS__:
    for j in (1, 2, 3):
        suffix = "Hand" + f + str(j)
        pb = rig.pose.bones.get(prefix + "Left" + suffix)
        if pb is None:
            continue
        q = pb.matrix_basis.to_quaternion()
        out[suffix] = [round(q.w, 6), round(q.x, 6), round(q.y, 6), round(q.z, 6)]

# how closed is it? angle of each joint away from rest
tot = sum(abs(Quaternion(v).angle) for v in out.values())
print("captured %d joints, total flexion %.0f deg" % (len(out), tot * 57.2958))
with open(r"__OUT__", "w") as fh:
    json.dump(out, fh, indent=1)
print("wrote __OUT__")
'''


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    fbx = os.path.abspath(sys.argv[1]).replace("\\", "/")
    if not os.path.exists(fbx):
        print("no such file:", fbx)
        return 2
    frame = sys.argv[2] if len(sys.argv) > 2 else "None"
    code = (CODE.replace("__FBX__", fbx)
                .replace("__OUT__", OUT.replace("\\", "/"))
                .replace("__FINGERS__", repr(FINGERS))
                .replace("__FRAME__", frame))
    print(blender.sh(code, timeout=600))
    if os.path.exists(OUT):
        print("\ngrip_pose.json:", len(json.load(open(OUT))), "joints")
        print("now re-run:  python scripts/statics-render/render_all.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
