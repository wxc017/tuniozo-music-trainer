"""Driver using the textured Mixamo character instead of the generated body."""
import json
import blender
from renderlib import RENDER
from charlib import CHAR
from gym import GYM

OUT = ("C:/Users/wilda/AppData/Local/Temp/claude/C--Tunizo-App/"
       "f22484ba-583f-4648-b7e7-60d645a84756/scratchpad/out/")
FBX = "C:/Users/wilda/Downloads/Hanging Idle (1).fbx"

SETUP = RENDER + GYM + CHAR + r'''
import os
os.makedirs(r"__OUT__", exist_ok=True)
body, rig, MESHES = build_character(r"__FBX__")
print("prefix in use:", MX, "| grip joints:", len(GRIP))
'''.replace("__OUT__", OUT).replace("__FBX__", FBX)

SHOOT = r'''
FIXED = set(MESHES) | {rig}

def build_scene(pose):
    """Pose the figure and hang a ring in each hand. Returns the tori and the
    per-hand tube frames so a caller can aim a camera at one of them."""
    for o in list(bpy.data.objects):
        if o not in FIXED:
            bpy.data.objects.remove(o, do_unlink=True)
    apply_pose(rig, pose)
    orient(rig, pose["body_up"], pose["body_front"])
    sup = bool(pose.get("support", False))
    yaw = float(pose.get("forearm_rot", 0.0))
    for s in ("L", "R"):
        set_grip_pose(rig, s, support=sup, yaw_deg=yaw,
                      body_axis=(Vector(pose['body_up']),
                                 Vector(pose['body_front'])))

    anch = anchor_frame(rig)
    RM, SM = RINGMT(), STRAP()
    tori, FR = [], {}
    for s in ("L", "R"):
        # the ring's place on the palm does not depend on the fingers, so it is
        # fixed first and the fist is then closed onto it
        FR[s] = tube_frame(rig, body, s, anch, support=sup)
        contact, t, n, u, h, c = FR[s]
        wr, mid, hh, aa, pn = hand_frame(rig, s)
        k, contact, r, gp = fit_grip(rig, body, s, mid, pn, hh, t)
        print("    grip %s: k=%.2f  clearance %+.4f m  enclosed to %.0f deg"
              % (s, k, r - R_TUBE, 360 - gp))
        # the ring hangs from the contact toward its anchor, swung far enough
        # on its own tangent that its far side clears the forearm
        u = (anch[s] - contact).normalized()
        c = ring_swing(rig, body, s, contact, t, u)
        FR[s] = (contact, t, pn, u, h, c)
        centre = contact + c * R_MAJOR
        nrm = t.cross(c).normalized()
        bpy.ops.mesh.primitive_torus_add(location=centre, major_radius=R_MAJOR,
                                         minor_radius=R_TUBE, major_segments=72,
                                         minor_segments=24)
        o = bpy.context.object
        o.rotation_mode = 'QUATERNION'
        o.rotation_quaternion = nrm.to_track_quat('Z', 'Y')
        o.data.materials.append(RM)
        for p in o.data.polygons: p.use_smooth = True
        tori.append(o)
        top = centre + (anch[s] - centre).normalized() * R_MAJOR
        d = anch[s] - top
        bpy.ops.mesh.primitive_cylinder_add(radius=0.0085, depth=d.length,
                                            vertices=16, location=top + d / 2)
        st = bpy.context.object
        st.rotation_mode = 'QUATERNION'
        st.rotation_quaternion = d.to_track_quat('Z', 'Y')
        st.data.materials.append(SM)
    return tori, FR


def shoot(name, pose, res=1000, azim=None, elev=None, pad=1.10, exposure=-1.6):
    tori, FR = build_scene(pose)
    az, el = auto_view(rig)
    if azim is not None: az = azim
    if elev is not None: el = elev
    stage(list(MESHES) + tori, res=res, azim=az, elev=el, pad=pad, exposure=exposure)
    render(r"__OUT__" + name + ".png")
    gl = hand_frame(rig, "L")[1]; gr = hand_frame(rig, "R")[1]
    print("  %-22s dz=%.4f span=%.3f  view az=%.0f el=%.0f"
          % (name, abs(gl.z - gr.z), (gl - gr).length, az, el))


def closeup(name, pose, side="L", res=900, dist=0.30, view="tube", exposure=-1.6):
    """A camera parked on the hand. `view`:
         tube  — down the tube axis, so the fist reads as a closed tunnel
         palm  — square onto the palm, so finger/tube contact reads
         over  — along the forearm from the elbow, past the wrist"""
    tori, FR = build_scene(pose)
    # stage() first: it owns the lights and the colour management, and without
    # it a hand-placed camera renders into a black frame
    stage(list(MESHES) + tori, res=res, exposure=exposure)
    contact, t, n, u, h, c = FR[side]
    if view == "tube":
        d = t.copy()
    elif view == "palm":
        d = -n
    else:
        d = h.copy()
    if view == "tube" and d.dot(Vector((0, -1, 0))) < 0:
        d = -d                              # keep the camera on the viewer's side
    d.normalize()
    cam = bpy.context.scene.camera
    cam.data.lens = 70
    cam.location = contact + d * dist
    cam.rotation_mode = 'QUATERNION'
    cam.rotation_quaternion = d.to_track_quat('Z', 'Y')
    render(r"__OUT__" + name + ".png")
    print("  closeup %-18s %s/%s  contact=%s" % (name, side, view,
          [round(x, 3) for x in contact]))
'''.replace("__OUT__", OUT)


def run(poses, extra="", timeout=2400, **kw):
    code = SETUP + SHOOT + "\nPOSES = " + repr(poses) + "\n"
    code += "OPTS = " + repr(kw) + "\n"
    code += "for _n, _p in POSES.items():\n    shoot(_n, _p, **OPTS)\n"
    code += extra
    return blender.sh(code, timeout=timeout)
