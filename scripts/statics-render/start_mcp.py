import bpy, traceback, addon_utils

LOG = r"C:/Users/wilda/AppData/Local/Temp/claude/C--Tunizo-App/f22484ba-583f-4648-b7e7-60d645a84756/scratchpad/mcp_start.log"

def w(msg):
    with open(LOG, "a") as fh:
        fh.write(str(msg) + "\n")

def _go():
    try:
        w("all addons: %r" % (list(bpy.context.preferences.addons.keys()),))
        w("config: %s" % bpy.utils.resource_path('USER'))
        w("online_access=%r  override=%r" % (bpy.app.online_access,
                                             bpy.app.online_access_override))
        repos = [(r.module, r.enabled, r.directory)
                 for r in bpy.context.preferences.extensions.repos]
        w("repos: %r" % (repos,))
        if not bpy.app.online_access:
            bpy.context.preferences.system.use_online_access = True
            w("enabled online access")
        r = addon_utils.enable("bl_ext.user_default.mcp", default_set=True,
                               persistent=True)
        w("enable -> %r" % (r,))
        bpy.ops.wm.save_userpref()
        r = bpy.ops.blmcp.server_start()
        w("server_start -> %r" % (r,))
    except Exception:
        w(traceback.format_exc())
    return None

open(LOG, "w").close()
w("startup script loaded")
bpy.app.timers.register(_go, first_interval=4.0, persistent=True)
