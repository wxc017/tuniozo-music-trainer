import json, sys, blender, pipeline3
P = {p['key']: p for p in json.load(open('poses.json'))}
keys = sys.argv[1:] or list(P)
code = (pipeline3.SETUP + pipeline3.SHOOT + "\nPOSES = " + repr({k: P[k] for k in keys})
        + "\nfor _n,_p in POSES.items(): shoot(_n,_p)\n")
print(blender.sh(code, timeout=3000))
