"""Export the Mixamo gymnast + one animation clip per position as a single .glb.

Why clips rather than a table of bone quaternions: Blender stores a pose bone's
rotation relative to its REST matrix in the bone's own space (Y along the bone),
and glTF stores a node's local transform in a Y-up scene. Converting between
those by hand is exactly the sort of thing that silently comes out mirrored.
Baking each position into an ACTION and letting the glTF exporter emit it as a
clip makes the exporter responsible for that conversion, and the viewer just
seeks the clip to t=0.

It also sets up the next thing the app wants: a transition between two positions
is the same mechanism with two keyframes instead of one.
"""
import json
import blender
from renderlib import RENDER
from charlib import CHAR
from gym import GYM

OUT_GLB = "C:/Tunizo/App/public/models/gymnast.glb"
OUT_JSON = "C:/Tunizo/App/public/statics/rings3d.json"
FBX = "C:/Users/wilda/Downloads/Hanging Idle (1).fbx"
TEX = 1024          # 4096 atlases are 7 of them; the glb has to load over HTTP

CODE = RENDER + GYM + CHAR + r'''
import json, math, os
from mathutils import Vector, Matrix, Quaternion

body, rig, MESHES = build_character(r"__FBX__")

# The character ships seven 4096x4096 atlases. Left alone they dominate the glb
# (well over 100 MB) for a figure that is never more than a few hundred pixels
# tall on screen. Rescale in place before export; the exporter then packs what
# it finds.
for im in bpy.data.images:
    if im.size[0] > __TEX__ or im.size[1] > __TEX__:
        im.scale(min(im.size[0], __TEX__), min(im.size[1], __TEX__))
print("textures rescaled to <= __TEX__ px")

# The FBX wires a Non-Color copy of the COLOUR map into Alpha. Cycles renders
# it opaque anyway, so it never showed; glTF reads it as a real alpha channel,
# exports the material as blended, and the skin comes back a mottled mess. Skin
# is opaque — cut the link.
for mt in bpy.data.materials:
    if not mt.node_tree:
        continue
    for nd in mt.node_tree.nodes:
        if nd.type != 'BSDF_PRINCIPLED':
            continue
        al = nd.inputs.get("Alpha")
        for lk in list(al.links) if al else []:
            mt.node_tree.links.remove(lk)
        if al:
            al.default_value = 1.0
    mt.blend_method = 'OPAQUE'

# glTF is Y-up; Blender is Z-up. The exporter converts the meshes for us, so the
# ring data has to be converted the same way to line up.
def to_gl(v):
    return [round(v.x, 5), round(v.z, 5), round(-v.y, 5)]

def dir_gl(v):
    """Directions convert exactly like positions. Exporting a DIRECTION and
    rebuilding the rotation in three (setFromUnitVectors) avoids converting a
    quaternion between a Z-up and a Y-up basis by hand — which is what put the
    rings at the wrong angle and left the hands looking unattached."""
    d = v.normalized()
    return [round(d.x, 5), round(d.z, 5), round(-d.y, 5)]

rig.rotation_mode = 'QUATERNION'
rig.animation_data_create()
# Stashing each finished pose as an NLA strip makes the NLA start EVALUATING it,
# so from pose 2 onward every view_layer.update() overwrote the pose bones with
# whatever the stacked strips produced — the Blender renders stayed correct
# (they never touch the NLA) while the exported clips were quietly contaminated.
# Build with NLA evaluation off; the exporter needs it back on at the end.
rig.animation_data.use_nla = False
for tr in list(rig.animation_data.nla_tracks):
    rig.animation_data.nla_tracks.remove(tr)
rig.animation_data.action = None
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a, do_unlink=True)
rings = {}

for pose in POSES:
    key = pose["key"]
    apply_pose(rig, pose)
    # root BONE, not the object matrix — see orient_root()
    orient_root(rig, pose["body_up"], pose["body_front"])
    sup = bool(pose.get("support", False))
    yaw = float(pose.get("forearm_rot", 0.0))
    for s in ("L", "R"):
        set_grip_pose(rig, s, support=sup, yaw_deg=yaw,
                      body_axis=(Vector(pose['body_up']),
                                 Vector(pose['body_front'])))
    anch = anchor_frame(rig)

    entry = {"rings": [], "straps": [], "support": sup}
    for s in ("L", "R"):
        _, t, _, _, h, _ = tube_frame(rig, body, s, anch, support=sup)
        wr, mid, hh, aa, pn = hand_frame(rig, s)
        k, contact, r, gp = fit_grip(rig, body, s, mid, pn, hh, t)
        u = (anch[s] - contact).normalized()
        c = ring_swing(rig, body, s, contact, t, u)
        centre = contact + c * R_MAJOR
        nrm = t.cross(c).normalized()
        entry["rings"].append({"pos": to_gl(centre), "normal": dir_gl(nrm)})
        top = centre + (anch[s] - centre).normalized() * R_MAJOR
        d = anch[s] - top
        entry["straps"].append({"pos": to_gl(top + d / 2), "dir": dir_gl(d),
                                "len": round(d.length, 4)})
        if s == "L":
            print("  %-22s grip k=%.2f clearance %+.4f" % (key, k, r - R_TUBE))
    rings[key] = entry

    # bake the pose into an action; every pose bone is keyed, so the fitted
    # fingers travel with it
    act = bpy.data.actions.new(key)
    act.use_fake_user = True
    rig.animation_data.action = act
    for f in (0, 1):
        for pb in rig.pose.bones:
            pb.rotation_mode = 'QUATERNION'
            pb.keyframe_insert(data_path="rotation_quaternion", frame=f)
    rig.animation_data.action = None
    tr = rig.animation_data.nla_tracks.new()
    tr.name = key
    tr.strips.new(key, 0, act)

rig.animation_data.use_nla = True          # the exporter reads the strips
bpy.context.view_layer.update()

bpy.ops.object.select_all(action='DESELECT')
for m in MESHES:
    m.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(
    filepath=r"__GLB__", export_format='GLB', use_selection=True,
    export_animations=True, export_animation_mode='ACTIONS',
    export_yup=True, export_apply=False, export_skins=True,
    export_morph=False, export_materials='EXPORT',
    export_image_format='JPEG', export_jpeg_quality=80,
    export_bake_animation=False, export_nla_strips=True,
)
with open(r"__JSON__", "w") as fh:
    json.dump({"ringRadius": R_MAJOR, "tubeRadius": R_TUBE, "poses": rings}, fh, indent=1)
print("exported", len(rings), "clips")
print("glb size %.1f MB" % (os.path.getsize(r"__GLB__") / 1e6))
'''.replace("__GLB__", OUT_GLB).replace("__JSON__", OUT_JSON) \
   .replace("__FBX__", FBX).replace("__TEX__", str(TEX))

if __name__ == "__main__":
    POSES = json.load(open("poses.json"))
    print(blender.sh("POSES = " + repr(POSES) + "\n" + CODE, timeout=3000))
