"""Render the EXPORTED glb, not the Blender scene it came from.

The app's 3D view consumes public/models/gymnast.glb + rings3d.json, and every
bug so far lived in the gap between the Blender scene and that file — dropped
armature animation, a bad quaternion basis change, un-masked helper geometry.
Importing the glb back and rendering it exercises exactly what three.js sees, and
unlike the browser it writes a PNG I can actually look at.

glTF is Y-up and Blender's importer converts back to Z-up, so the ring data
(which was written Y-up) converts back the same way: gl (x,y,z) -> (x, -z, y).
"""
import json
import sys
import blender

GLB = "C:/Tunizo/App/public/models/gymnast.glb"
RINGS = "C:/Tunizo/App/public/statics/rings3d.json"
OUT = ("C:/Users/wilda/AppData/Local/Temp/claude/C--Tunizo-App/"
       "f22484ba-583f-4648-b7e7-60d645a84756/scratchpad/out/")

KEYS = sys.argv[1:] or ["l_sit", "iron_cross", "planche", "dead_hang"]

CODE = r'''
import bpy, math, json
from mathutils import Vector, Matrix, Quaternion

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for c in (bpy.data.actions, bpy.data.meshes, bpy.data.armatures,
          bpy.data.lights, bpy.data.cameras, bpy.data.worlds, bpy.data.materials):
    for d in list(c):
        c.remove(d)

bpy.ops.import_scene.gltf(filepath=r"__GLB__")
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
mesh = [o for o in bpy.data.objects if o.type == 'MESH']
print("imported: %d actions, mesh verts %s" % (len(bpy.data.actions),
      [len(m.data.vertices) for m in mesh]))

RINGS = json.load(open(r"__RINGS__"))
def to_bl(v):                       # glTF Y-up -> Blender Z-up
    return Vector((v[0], -v[2], v[1]))

def mat(name, rgb, rough):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1.0)
    b.inputs["Roughness"].default_value = rough
    return m
RM = mat("Ring", (0.196, 0.098, 0.038), 0.34)
SM = mat("Strap", (0.640, 0.628, 0.598), 0.68)

def shoot(key):
    for o in list(bpy.data.objects):
        if o.name.startswith(("Ring_", "Strap_", "Cam_", "Lite_")):
            bpy.data.objects.remove(o, do_unlink=True)

    act = bpy.data.actions.get(key) or next(
        (a for a in bpy.data.actions if a.name.endswith(key)), None)
    if act is None:
        print("  ! no action", key); return
    rig.animation_data_create()
    rig.animation_data.action = act
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()

    e = RINGS["poses"][key]
    for i, r in enumerate(e["rings"]):
        c = to_bl(r["pos"]); n = to_bl(r["normal"]).normalized()
        bpy.ops.mesh.primitive_torus_add(location=c, major_radius=RINGS["ringRadius"],
                                         minor_radius=RINGS["tubeRadius"],
                                         major_segments=72, minor_segments=24)
        o = bpy.context.object; o.name = "Ring_%d" % i
        o.rotation_mode = 'QUATERNION'
        o.rotation_quaternion = n.to_track_quat('Z', 'Y')
        o.data.materials.append(RM)
        for p in o.data.polygons: p.use_smooth = True
    for i, s in enumerate(e["straps"]):
        c = to_bl(s["pos"]); d = to_bl(s["dir"]).normalized()
        bpy.ops.mesh.primitive_cylinder_add(radius=0.0085, depth=s["len"],
                                            vertices=16, location=c)
        o = bpy.context.object; o.name = "Strap_%d" % i
        o.rotation_mode = 'QUATERNION'
        o.rotation_quaternion = d.to_track_quat('Z', 'Y')
        o.data.materials.append(SM)

    # frame on the posed BONES (skinned bounds are bind-pose and useless here)
    pts = [rig.matrix_world @ pb.head for pb in rig.pose.bones]
    pts += [to_bl(r["pos"]) for r in e["rings"]]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    ctr = (lo + hi) / 2
    rad = (hi - lo).length / 2 + 0.12

    # pick the view that shows the pose most openly, same rule as auto_view():
    # a fixed camera looks straight down the legs of an L-sit and turns them
    # into stubs, which is exactly what made the exported poses look broken
    best, score = Vector((0, 1, 0)), -1.0
    for adeg in range(0, 360, 15):
        for edeg in (-5, 8, 22):
            ar, er = math.radians(adeg), math.radians(edeg)
            v = Vector((-math.sin(ar)*math.cos(er), math.cos(ar)*math.cos(er), -math.sin(er)))
            rt = v.cross(Vector((0, 0, 1)))
            if rt.length < 1e-6: continue
            rt.normalize(); up = rt.cross(v).normalized()
            xs = [p.dot(rt) for p in pts]; ys = [p.dot(up) for p in pts]
            mx, my = sum(xs)/len(xs), sum(ys)/len(ys)
            sxx = sum((x-mx)**2 for x in xs)/len(xs)
            syy = sum((y-my)**2 for y in ys)/len(ys)
            sxy = sum((x-mx)*(y-my) for x, y in zip(xs, ys))/len(xs)
            tr2, det = sxx+syy, sxx*syy - sxy*sxy
            disc = max(0.0, tr2*tr2/4 - det)
            l1, l2 = tr2/2 + math.sqrt(disc), tr2/2 - math.sqrt(disc)
            sc2 = math.sqrt(max(l1, 0.0)*max(l2, 0.0)) * (1 + 0.02*math.cos(ar))
            if sc2 > score: score, best = sc2, v
    view = best
    cam_loc = ctr - view * (rad / math.tan(math.radians(19)))
    bpy.ops.object.camera_add(location=cam_loc)
    cam = bpy.context.object; cam.name = "Cam_1"; cam.data.lens = 52
    cam.rotation_mode = 'QUATERNION'
    cam.rotation_quaternion = (-view).to_track_quat('Z', 'Y')
    bpy.context.scene.camera = cam

    for loc, en in ((ctr + Vector((2.2, -2.0, 2.4)), 1.0),
                    (ctr + Vector((-2.6, -1.2, 0.8)), 0.35),
                    (ctr + Vector((-0.8, 2.6, 1.6)), 0.6)):
        bpy.ops.object.light_add(type='AREA', location=loc)
        L = bpy.context.object; L.name = "Lite_%d" % len(bpy.data.objects)
        L.data.energy = en * 60.0 * (loc - ctr).length_squared
        L.data.size = 1.6
        L.rotation_mode = 'QUATERNION'
        L.rotation_quaternion = (ctr - loc).to_track_quat('-Z', 'Y')

    sc = bpy.context.scene
    w = bpy.data.worlds.get("W") or bpy.data.worlds.new("W")
    sc.world = w; w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.03, 0.03, 0.04, 1)
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x = sc.render.resolution_y = 800
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.exposure = -1.2
    sc.eevee.taa_render_samples = 48
    sc.render.filepath = r"__OUT__" + "rt_" + key + ".png"
    bpy.ops.render.render(write_still=True)
    print("  rendered", key)

for k in __KEYS__:
    shoot(k)
'''.replace("__GLB__", GLB).replace("__RINGS__", RINGS) \
   .replace("__OUT__", OUT).replace("__KEYS__", repr(KEYS))

print(blender.sh(CODE, timeout=1800))
