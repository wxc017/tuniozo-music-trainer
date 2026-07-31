"""Use the textured Mixamo character as the figure.

MPFB generated an anatomically correct body but a visually unconvincing one: no
skin texture, no normal map, a mask for a face. Everything that makes a 3D human
read as human is surface, and MPFB's procedural skin carries none of it. A
Mixamo "with skin" download does: a 9.5k-vert body plus 4096² texture maps,
already rigged to the same skeleton the pose solver now drives.

Two things to get right on import:
  * the FBX arrives POSED (frame 1 of the animation it shipped with), so the
    action has to be cleared or every pose is built on top of a hanging idle;
  * Mixamo bone names carry a per-export prefix — this file used `mixamorig12:`,
    not `mixamorig:` — so the prefix is detected rather than assumed.
"""

CHAR = r'''
import bpy, math
from mathutils import Vector, Matrix

# Everything here shares ONE material and ONE 4096 atlas — body, shirt, pants
# and shoes alike — and the body's own texture has a dark t-shirt painted into
# it. So stripping the shirt does not expose a torso, it exposes a painted one,
# with the sleeve edges left as dark bands round the upper arms. Keep the
# clothing meshes and recolour them instead. White long trousers and a light
# top is the men's rings uniform anyway, and it reads far better against a dark
# background than street clothes do. Shoes go: gymnasts compete barefoot.
DROP_MESHES = ("Sneakers",)
KIT_MESHES = ("Shirt", "Pants")
TARGET_HEIGHT = 1.66          # elite rings specialists are short

def detect_prefix(rig):
    for b in rig.data.bones:
        if b.name.endswith("Hips"):
            return b.name[:-len("Hips")]
    return "mixamorig:"

def build_character(fbx, target_height=TARGET_HEIGHT, drop=DROP_MESHES):
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in (bpy.data.actions, bpy.data.meshes, bpy.data.armatures,
              bpy.data.materials, bpy.data.images, bpy.data.cameras,
              bpy.data.lights, bpy.data.worlds):
        for d in list(c):
            try:
                c.remove(d)
            except Exception:
                pass

    bpy.ops.import_scene.fbx(filepath=fbx, automatic_bone_orientation=True)
    rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')

    # Capture the grip BEFORE clearing: these rotations are relative to THIS
    # rig's rest pose, so applying them back to this same rig reproduces the
    # artist's hand exactly. Transferring them to another skeleton's idea of
    # the same bones is what went subtly wrong before.
    sc = bpy.context.scene
    sc.frame_set(int((sc.frame_start + sc.frame_end) / 2))
    bpy.context.view_layer.update()
    grip = {}
    for f in ("Thumb", "Index", "Middle", "Ring", "Pinky"):
        for j in (1, 2, 3):
            suffix = "Hand" + f + str(j)
            pb = rig.pose.bones.get(detect_prefix(rig) + "Left" + suffix)
            if pb is None:
                continue
            q = pb.matrix_basis.to_quaternion()
            grip[suffix] = [q.w, q.x, q.y, q.z]
    print("captured grip: %d joints from frame %d" % (len(grip), sc.frame_current))

    # the FBX ships posed — clear it or every position stacks on a hanging idle
    if rig.animation_data:
        rig.animation_data.action = None
        rig.animation_data_clear()
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a, do_unlink=True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.context.view_layer.update()

    for o in list(bpy.data.objects):
        if o.type == 'MESH' and any(d.lower() in o.name.lower() for d in drop):
            bpy.data.objects.remove(o, do_unlink=True)

    meshes = [o for o in bpy.data.objects if o.type == 'MESH']

    # normalise scale and orientation on the ARMATURE; the meshes are its
    # children so they follow, and applying the transform keeps the pose solver
    # working in real metres
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = rig

    dg = bpy.context.evaluated_depsgraph_get()
    zs = []
    for m in meshes:
        ev = m.evaluated_get(dg)
        me = ev.to_mesh()
        MW = m.matrix_world
        zs += [(MW @ v.co).z for v in me.vertices]
        ev.to_mesh_clear()
    height = max(zs) - min(zs)
    s = target_height / height if height > 1e-6 else 1.0
    rig.scale = (rig.scale.x * s, rig.scale.y * s, rig.scale.z * s)
    bpy.context.view_layer.update()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    # drop the figure so the feet sit on z = 0, as MPFB's did
    dg = bpy.context.evaluated_depsgraph_get()
    zs = []
    for m in meshes:
        ev = m.evaluated_get(dg)
        me = ev.to_mesh()
        MW = m.matrix_world
        zs += [(MW @ v.co).z for v in me.vertices]
        ev.to_mesh_clear()
    rig.location.z -= min(zs)
    bpy.context.view_layer.update()

    set_prefix(detect_prefix(rig))
    GRIP.clear(); GRIP.update(grip)
    # competition kit, and take the plastic sheen off the skin: the FBX arrives
    # with a Phong specular that Blender converts into a wet-looking highlight
    kit = mat("Kit", (0.560, 0.570, 0.600), 0.62, spec=0.30)
    for m in meshes:
        if any(k.lower() in m.name.lower() for k in KIT_MESHES):
            m.data.materials.clear()
            m.data.materials.append(kit)
    for mt in bpy.data.materials:
        for nd in mt.node_tree.nodes if mt.node_tree else []:
            if nd.type == 'BSDF_PRINCIPLED':
                if not nd.inputs["Roughness"].links:
                    nd.inputs["Roughness"].default_value = max(
                        0.45, nd.inputs["Roughness"].default_value)
                if "Specular IOR Level" in nd.inputs:
                    nd.inputs["Specular IOR Level"].default_value = 0.30

    body = next((m for m in meshes if "body" in m.name.lower()), meshes[0])
    print("character: %s, %d meshes, height %.3f m, prefix %r"
          % (body.name, len(meshes), max(zs) - min(zs), detect_prefix(rig)))
    for m in meshes:
        for p in m.data.polygons:
            p.use_smooth = True
    return body, rig, meshes
'''
