"""Blender-side rendering: shorts shader, materials, lights, framed camera.

The ring/grip helpers that used to live here were superseded by gym.py once
the figure moved to MPFB's rig, which has real finger chains.
"""

RENDER = r'''
import bpy, math
from mathutils import Vector, Matrix, Quaternion

def _band(nt, value, lo, hi, soft):
    """Smooth 0→1→0 window over `value`, as two Map Range nodes."""
    a = nt.nodes.new("ShaderNodeMapRange"); a.interpolation_type = 'SMOOTHSTEP'
    a.inputs["From Min"].default_value = lo - soft
    a.inputs["From Max"].default_value = lo + soft
    b = nt.nodes.new("ShaderNodeMapRange"); b.interpolation_type = 'SMOOTHSTEP'
    b.inputs["From Min"].default_value = hi + soft
    b.inputs["From Max"].default_value = hi - soft
    nt.links.new(value, a.inputs["Value"])
    nt.links.new(value, b.inputs["Value"])
    m = nt.nodes.new("ShaderNodeMath"); m.operation = 'MULTIPLY'
    nt.links.new(a.outputs["Result"], m.inputs[0])
    nt.links.new(b.outputs["Result"], m.inputs[1])
    return m.outputs[0]

def body_material(hem, waist, arm_x=0.25):
    """One material for the whole figure: skin, with a shorts region masked in
    from the baked rest position. Painting the shorts instead of modelling them
    means there is no second mesh to tear at its boundary."""
    m = bpy.data.materials.new("Body"); m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]

    attr = nt.nodes.new("ShaderNodeAttribute"); attr.attribute_name = "rest"
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(attr.outputs["Color"], sep.inputs["Vector"])

    # |x| from the +1-offset encoding
    sx = nt.nodes.new("ShaderNodeMath"); sx.operation = 'SUBTRACT'
    sx.inputs[1].default_value = 1.0
    nt.links.new(sep.outputs["X"], sx.inputs[0])
    ax = nt.nodes.new("ShaderNodeMath"); ax.operation = 'ABSOLUTE'
    nt.links.new(sx.outputs[0], ax.inputs[0])
    notarm = nt.nodes.new("ShaderNodeMapRange"); notarm.interpolation_type = 'SMOOTHSTEP'
    notarm.inputs["From Min"].default_value = arm_x + 0.03
    notarm.inputs["From Max"].default_value = arm_x - 0.03
    nt.links.new(ax.outputs[0], notarm.inputs["Value"])

    # a little noise on the hem so it is not a machined ring
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 9.0
    nz.inputs["Detail"].default_value = 2.0
    wob = nt.nodes.new("ShaderNodeMath"); wob.operation = 'MULTIPLY_ADD'
    wob.inputs[1].default_value = 0.016
    wob.inputs[2].default_value = -0.008
    nt.links.new(nz.outputs["Fac"], wob.inputs[0])
    zz = nt.nodes.new("ShaderNodeMath"); zz.operation = 'ADD'
    nt.links.new(sep.outputs["Z"], zz.inputs[0])
    nt.links.new(wob.outputs[0], zz.inputs[1])

    band = _band(nt, zz.outputs[0], hem, waist, 0.006)
    mask = nt.nodes.new("ShaderNodeMath"); mask.operation = 'MULTIPLY'
    nt.links.new(band, mask.inputs[0])
    nt.links.new(notarm.outputs["Result"], mask.inputs[1])

    col = nt.nodes.new("ShaderNodeMixRGB")
    col.inputs["Color1"].default_value = (0.246, 0.135, 0.093, 1)   # skin
    col.inputs["Color2"].default_value = (0.021, 0.024, 0.036, 1)   # shorts
    nt.links.new(mask.outputs[0], col.inputs["Fac"])
    nt.links.new(col.outputs["Color"], bsdf.inputs["Base Color"])

    rough = nt.nodes.new("ShaderNodeMixRGB")
    rough.inputs["Color1"].default_value = (0.44, 0.44, 0.44, 1)
    rough.inputs["Color2"].default_value = (0.90, 0.90, 0.90, 1)
    nt.links.new(mask.outputs[0], rough.inputs["Fac"])
    nt.links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])

    sss = nt.nodes.new("ShaderNodeMixRGB")
    sss.inputs["Color1"].default_value = (0.28, 0.28, 0.28, 1)
    sss.inputs["Color2"].default_value = (0.0, 0.0, 0.0, 1)
    nt.links.new(mask.outputs[0], sss.inputs["Fac"])
    if "Subsurface Weight" in bsdf.inputs:
        nt.links.new(sss.outputs["Color"], bsdf.inputs["Subsurface Weight"])
        bsdf.inputs["Subsurface Radius"].default_value = (0.28, 0.12, 0.08)
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.34

    # fine skin grain, so highlights break up instead of reading as plastic
    fine = nt.nodes.new("ShaderNodeTexNoise")
    fine.inputs["Scale"].default_value = 260.0
    fine.inputs["Detail"].default_value = 4.0
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.06
    bump.inputs["Distance"].default_value = 0.003
    nt.links.new(fine.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m

def add_shorts(m, hem, waist, arm_x=0.26):
    """Mask a pair of shorts INTO an existing skin material.

    Replacing MPFB's procedural skin with a flat colour threw away everything
    that makes it look like skin. Instead, keep that material and mix the cloth
    over it inside the same node tree: the existing Base Color / Roughness
    sources stay wired, and a rest-position mask fades cloth on top of them."""
    nt = m.node_tree
    out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None)
    if out is None or not out.inputs["Surface"].links:
        return m

    attr = nt.nodes.new("ShaderNodeAttribute"); attr.attribute_name = "rest"
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(attr.outputs["Color"], sep.inputs["Vector"])
    sx = nt.nodes.new("ShaderNodeMath"); sx.operation = 'SUBTRACT'
    sx.inputs[1].default_value = 1.0
    nt.links.new(sep.outputs["X"], sx.inputs[0])
    ax = nt.nodes.new("ShaderNodeMath"); ax.operation = 'ABSOLUTE'
    nt.links.new(sx.outputs[0], ax.inputs[0])
    notarm = nt.nodes.new("ShaderNodeMapRange"); notarm.interpolation_type = 'SMOOTHSTEP'
    notarm.inputs["From Min"].default_value = arm_x + 0.03
    notarm.inputs["From Max"].default_value = arm_x - 0.03
    nt.links.new(ax.outputs[0], notarm.inputs["Value"])

    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 11.0
    nz.inputs["Detail"].default_value = 2.0
    wob = nt.nodes.new("ShaderNodeMath"); wob.operation = 'MULTIPLY_ADD'
    wob.inputs[1].default_value = 0.014
    wob.inputs[2].default_value = -0.007
    nt.links.new(nz.outputs["Fac"], wob.inputs[0])
    zz = nt.nodes.new("ShaderNodeMath"); zz.operation = 'ADD'
    nt.links.new(sep.outputs["Z"], zz.inputs[0])
    nt.links.new(wob.outputs[0], zz.inputs[1])

    band = _band(nt, zz.outputs[0], hem, waist, 0.005)
    mask = nt.nodes.new("ShaderNodeMath"); mask.operation = 'MULTIPLY'
    nt.links.new(band, mask.inputs[0])
    nt.links.new(notarm.outputs["Result"], mask.inputs[1])

    # MPFB's skin has no top-level Principled BSDF — it feeds node GROUPS
    # straight into the output — so patch a socket at a time finds nothing.
    # Mix whole shaders instead, which works whatever the skin is built from.
    cloth = nt.nodes.new("ShaderNodeBsdfPrincipled")
    cloth.inputs["Base Color"].default_value = (0.018, 0.021, 0.032, 1)
    cloth.inputs["Roughness"].default_value = 0.92
    if "Specular IOR Level" in cloth.inputs:
        cloth.inputs["Specular IOR Level"].default_value = 0.18
    if "Sheen Weight" in cloth.inputs:
        cloth.inputs["Sheen Weight"].default_value = 0.35

    skin_src = out.inputs["Surface"].links[0].from_socket
    mixsh = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(mask.outputs[0], mixsh.inputs["Fac"])
    nt.links.new(skin_src, mixsh.inputs[1])
    nt.links.new(cloth.outputs["BSDF"], mixsh.inputs[2])
    nt.links.new(mixsh.outputs["Shader"], out.inputs["Surface"])
    return m

def mat(name, rgb, rough=0.45, metal=0.0, spec=0.5):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if "Specular IOR Level" in b.inputs:
        b.inputs["Specular IOR Level"].default_value = spec
    return m

RINGMT = lambda: mat("Ring",  (0.196, 0.098, 0.038), 0.32)
STRAP  = lambda: mat("Strap", (0.640, 0.628, 0.598), 0.68)

# ───────────────────────────────────────────────────────── camera & lights ──
def world_pts(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        if o.type != 'MESH': continue
        ev = o.evaluated_get(dg)
        m = ev.to_mesh()
        MW = o.matrix_world
        pts += [MW @ v.co for v in m.vertices]
        ev.to_mesh_clear()
    return pts

def stage(subject, res=1000, azim=-14.0, elev=4.0, pad=1.10, lens=85, exposure=0.0):
    sc = bpy.context.scene
    pts = world_pts(subject)
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    ctr = (lo + hi) / 2

    # `view` is the direction the camera LOOKS. The figure faces −Y, so the
    # camera sits on the −Y side; positive elev raises it.
    a, e = math.radians(azim), math.radians(elev)
    view = Vector((-math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), -math.sin(e)))
    right = view.cross(Vector((0, 0, 1)))
    right = right.normalized() if right.length > 1e-6 else Vector((1, 0, 0))
    upv = right.cross(view).normalized()

    half = max(max(abs((p - ctr).dot(right)) for p in pts),
               max(abs((p - ctr).dot(upv)) for p in pts)) * pad

    bpy.ops.object.camera_add()
    cam = bpy.context.object
    cam.data.lens = lens
    fov = 2 * math.atan(18.0 / lens)
    dist = half / math.tan(fov / 2) + max(abs((p - ctr).dot(view)) for p in pts)
    cam.location = ctr - view * dist
    cam.rotation_mode = 'QUATERNION'
    cam.rotation_quaternion = (-view).to_track_quat('Z', 'Y')
    sc.camera = cam

    # Key high and to one side so the shoulders and lats get a shadow edge to
    # read against; two rims separate the silhouette from a dark page, which is
    # most of what stops a smooth mesh looking like a mannequin.
    S = max(half, 0.5)
    lights = ((ctr + right * 1.6 * S + upv * 1.7 * S - view * 1.5 * S, 1.00, 1.1, (1.00, 0.95, 0.89)),
              (ctr - right * 2.2 * S + upv * 0.4 * S - view * 1.4 * S, 0.14, 2.8, (0.78, 0.85, 1.00)),
              (ctr - right * 1.5 * S + upv * 1.4 * S + view * 1.9 * S, 0.55, 0.9, (0.90, 0.94, 1.00)),
              (ctr + right * 1.8 * S + upv * 0.1 * S + view * 1.8 * S, 0.38, 0.9, (1.00, 0.91, 0.83)))
    for loc, energy, size, warm in lights:
        bpy.ops.object.light_add(type='AREA', location=loc)
        Lo = bpy.context.object
        # inverse-square, so exposure stays put however far the camera pulled back
        Lo.data.energy = energy * 58.0 * (loc - ctr).length_squared
        Lo.data.size = size * S
        Lo.data.color = warm
        Lo.rotation_mode = 'QUATERNION'
        Lo.rotation_quaternion = (ctr - loc).to_track_quat('-Z', 'Y')

    w = bpy.data.worlds.new("W"); sc.world = w; w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.035, 0.037, 0.047, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 1.0

    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.exposure = exposure
    ee = sc.eevee
    ee.taa_render_samples = 128
    # EEVEE Next: ray-traced shadows + screen-space AO. Without these the mesh
    # is flat-lit and every muscle boundary washes out.
    for attr, val in (("use_raytracing", True), ("use_fast_gi", True),
                      ("fast_gi_method", 'AMBIENT_OCCLUSION_ONLY'),
                      ("shadow_ray_count", 4), ("shadow_step_count", 12),
                      ("fast_gi_distance", 0.30), ("fast_gi_ray_count", 4),
                      ("fast_gi_step_count", 12)):
        try:
            setattr(ee, attr, val)
        except Exception:
            pass
    try:
        sc.view_settings.view_transform = 'AgX'
        sc.view_settings.look = 'AgX - High Contrast'
    except Exception:
        pass
    return cam

def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
'''
