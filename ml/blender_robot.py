"""Glossy black android bust with red glowing eyes and seams, rendered with Blender (bpy).

Base mesh: "Xbot" from the three.js examples (examples/models/gltf/Xbot.glb, originally Mixamo),
re-materialled and lit here. Download it next to this script or pass its path:
    python ml/blender_robot.py /path/to/Xbot.glb   ->  public/img/robot.png (transparent)
"""
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public", "img")
SRC = next((a for a in sys.argv[1:] if a.endswith(".glb")), os.path.join(HERE, "Xbot.glb"))
SAMPLES = int(os.environ.get("SAMPLES", "160"))
RES = int(os.environ.get("RES", "100"))
YAW = float(os.environ.get("YAW", "-34"))

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.samples = SAMPLES
sc.cycles.device = "CPU"
sc.cycles.use_denoising = True
sc.render.film_transparent = True
sc.render.resolution_x, sc.render.resolution_y = 1100, 1300
sc.render.resolution_percentage = RES
sc.view_settings.view_transform = "Standard"
world = bpy.data.worlds.new("w"); sc.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.0, 0.0, 0.0, 1)


def principled(name, color, metal, rough, coat=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = color
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    b.inputs["Coat Weight"].default_value = coat
    b.inputs["Coat Roughness"].default_value = 0.02
    return m


def glow(name, strength):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs[0].default_value = (1.0, 0.02, 0.01, 1); em.inputs[1].default_value = strength
    out = nt.nodes.new("ShaderNodeOutputMaterial"); nt.links.new(em.outputs[0], out.inputs[0])
    return m


SHELL = principled("shell", (0.01, 0.01, 0.011, 1), 1.0, 0.06, coat=1.0)
SEAM = principled("seam", (0.02, 0.018, 0.018, 1), 1.0, 0.12)
LINE = glow("line", 3.0)
EYE = glow("eye", 14.0)
VISOR = glow("visor", 1.2)

bpy.ops.import_scene.gltf(filepath=SRC)
for o in list(bpy.data.objects):
    if o.type == "MESH" and o.name.startswith("Icosphere"):
        bpy.data.objects.remove(o)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
for o in bpy.data.objects:
    if o.type != "MESH":
        continue
    mat = SEAM if "Joint" in o.name else SHELL
    o.data.materials.clear(); o.data.materials.append(mat)
    sub = o.modifiers.new("s", "SUBSURF"); sub.levels = 1; sub.render_levels = 1
    for p in o.data.polygons:
        p.use_smooth = True

# where the face is
def bone_pos(name):
    b = arm.data.bones[name]
    return arm.matrix_world @ b.head_local

head = bone_pos("mixamorig:Head")
eyes = [bone_pos("mixamorig:LeftEye"), bone_pos("mixamorig:RightEye")]
fwd = ((eyes[0] + eyes[1]) / 2 - head); fwd.z = 0; fwd.normalize()

# measure the head around eye height so the visor band hugs the surface
surf = next(o for o in bpy.data.objects if o.type == "MESH" and "Surface" in o.name)
ez = (eyes[0].z + eyes[1].z) / 2
pts = [surf.matrix_world @ v.co for v in surf.data.vertices]
band = [p for p in pts if abs(p.z - ez) < 0.012 and p.z > 1.3]
cx = sum(p.x for p in band) / len(band); cy = sum(p.y for p in band) / len(band)
rx = max(abs(p.x - cx) for p in band); ry = max(abs(p.y - cy) for p in band)
top = max(p.z for p in pts)
hz_mid = (top + head.z) / 2


def curve_from(points, bevel, mat, closed):
    cu = bpy.data.curves.new("line", "CURVE"); cu.dimensions = "3D"
    cu.bevel_depth = bevel; cu.bevel_resolution = 3
    sp = cu.splines.new("POLY"); sp.points.add(len(points) - 1)
    for i, q in enumerate(points):
        sp.points[i].co = (q.x, q.y, q.z, 1)
    sp.use_cyclic_u = closed
    ob = bpy.data.objects.new("line", cu); bpy.context.collection.objects.link(ob)
    cu.materials.append(mat)
    return ob


def smooth(vals, k=2):
    n = len(vals)
    return [sum(vals[(i + j) % n] for j in range(-k, k + 1)) / (2 * k + 1) for i in range(n)]


def horizontal_band(z, lift, bevel, mat, bins=90, centre=None, span=None):
    sl = [p for p in pts if abs(p.z - z) < 0.006]
    radius = [0.0] * bins
    for p in sl:
        a = math.atan2(p.y - cy, p.x - cx); b = int((a + math.pi) / (2 * math.pi) * bins) % bins
        radius[b] = max(radius[b], math.hypot(p.x - cx, p.y - cy))
    for i in range(bins):                       # fill empty bins from neighbours
        if radius[i] == 0.0:
            radius[i] = next(radius[(i + d) % bins] for d in range(1, bins) if radius[(i + d) % bins] > 0)
    radius = smooth(radius)
    out = []
    for i, r in enumerate(radius):
        a = (i + 0.5) / bins * 2 * math.pi - math.pi
        if span is not None and abs((a - centre + math.pi) % (2 * math.pi) - math.pi) > span:
            continue
        out.append(Vector((cx + math.cos(a) * (r + lift), cy + math.sin(a) * (r + lift), z)))
    if span is not None:   # keep the arc in order, starting on one side of the face
        out.sort(key=lambda q: (math.atan2(q.y - cy, q.x - cx) - centre + math.pi) % (2 * math.pi))
    return curve_from(out, bevel, mat, span is None)


def crest(lift, bevel, mat, bins=60):
    zc = head.z + 0.04
    sl = [p for p in pts if abs(p.x - cx) < 0.005 and p.z > zc]
    radius = [0.0] * bins
    for p in sl:
        a = math.atan2(p.z - zc, p.y - cy)   # 0 = back (+y), pi = front (-y)
        if 0 <= a <= math.pi:
            b = min(bins - 1, int(a / math.pi * bins)); radius[b] = max(radius[b], math.hypot(p.y - cy, p.z - zc))
    keep = [(i, r) for i, r in enumerate(radius) if r > 0]
    out = []
    for i, r in keep[2:-2]:
        a = (i + 0.5) / bins * math.pi
        out.append(Vector((cx, cy + math.cos(a) * (r + lift), zc + math.sin(a) * (r + lift))))
    return curve_from(out, bevel, mat, False)


# like the reference: only two glowing eyes on a dark visor, no lines over the helmet
front = math.atan2(fwd.y, fwd.x)
horizontal_band(ez, 0.0012, 0.0011, VISOR, centre=front, span=math.radians(38))   # faint visor slit
for e in eyes:                                    # bright eye cores
    d = Vector((e.x - cx, e.y - cy, 0)); d.normalize()
    sl = [p for p in pts if abs(p.z - ez) < 0.006]
    near = [math.hypot(p.x - cx, p.y - cy) for p in sl if (Vector((p.x - cx, p.y - cy, 0)).normalized()).dot(d) > 0.96]
    r = max(near) if near else max(rx, ry)
    pos = Vector((cx + d.x * (r + 0.002), cy + d.y * (r + 0.002), ez))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=pos)
    s = bpy.context.object; s.scale = (0.018, 0.018, 0.0075); s.data.materials.append(EYE)
    bpy.ops.object.light_add(type="POINT", location=pos + Vector((d.x, d.y, 0)) * 0.03)   # eye glow spilling on the face
    gl = bpy.context.object; gl.data.energy = 2.5; gl.data.color = (1, 0.04, 0.02); gl.data.shadow_soft_size = 0.01

# turn everything so the robot looks to the left of the frame
bpy.ops.object.empty_add(location=(0, 0, 0))
pivot = bpy.context.object
for o in bpy.data.objects:
    if o is not pivot and o.parent is None and o.type in ("MESH", "ARMATURE", "CURVE"):
        o.parent = pivot
pivot.rotation_euler = (0, 0, math.radians(YAW) - math.atan2(fwd.x, -fwd.y))


def area(loc, target, energy, color, size, size_y=None):
    bpy.ops.object.light_add(type="AREA", location=loc)
    l = bpy.context.object
    l.data.energy = energy; l.data.color = color
    if size_y:                                    # long thin strip light -> long edge highlights
        l.data.shape = "RECTANGLE"; l.data.size = size; l.data.size_y = size_y
    else:
        l.data.size = size
    l.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()


C = Vector((0, 0, 1.45))
RED = (1, 0.03, 0.02)
# black glossy shell shaped only by long red strip reflections along its edges (like the reference)
area((0.9, 0.9, 1.6), C, 160, RED, 0.06, 1.6)       # strip, back right
area((-1.0, 0.7, 1.6), C, 130, RED, 0.06, 1.6)      # strip, back left
area((1.1, -0.4, 1.6), C, 70, RED, 0.05, 1.4)       # strip on the right cheek and shoulder
area((0.0, 0.4, 2.6), C, 60, RED, 0.06, 0.9)        # strip above: top edge of the helmet
area((-0.9, -1.1, 1.9), C, 18, (1, 0.03, 0.02), 0.5) # soft red fill so the black reads as glossy
area((-0.6, -1.3, 2.3), C, 10, (1, 0.94, 0.94), 0.05) # tiny white key for gloss

bpy.ops.object.camera_add(location=(0.18, -1.3, 1.6))
cam = bpy.context.object
cam.rotation_euler = (Vector((0.04, 0, 1.52)) - cam.location).to_track_quat("-Z", "Y").to_euler()
cam.data.lens = 55
sc.camera = cam

sc.render.filepath = os.path.join(OUT, "robot.png")
bpy.ops.render.render(write_still=True)
print("rendered robot", tuple(round(x, 2) for x in fwd))
