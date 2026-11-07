"""Render the red glowing 3D visuals used in the FraudPulse feature cards with Blender (bpy).

Run:  python ml/blender_assets_red.py [grid slab capsules icons]  ->  PNGs in public/img/3d-red/
Then: python ml/glow_post_red.py  ->  adds the glow and writes .webp
Every scene is built from code, so it can be re-rendered in any colour.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "img", "3d-red")
os.makedirs(OUT, exist_ok=True)
SAMPLES = int(os.environ.get("SAMPLES", "64"))

MINT = (1, 0.077, 0.0496, 1)
DEEP = (0.035, 0.00088, 0.00176, 1)


def reset(w=900, h=640, bg=DEEP):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = SAMPLES
    sc.cycles.device = "CPU"
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    world = bpy.data.worlds.new("w"); sc.world = world; world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = bg
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    return sc


def emission(name, color, strength):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs[0].default_value = color; em.inputs[1].default_value = strength
    out = nt.nodes.new("ShaderNodeOutputMaterial"); nt.links.new(em.outputs[0], out.inputs[0])
    return m


def principled(name, color, rough=0.3, metal=0.0, transmission=0.0, emit=None, emit_strength=0.0, alpha=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = color
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Transmission Weight"].default_value = transmission
    b.inputs["Alpha"].default_value = alpha
    if emit:
        b.inputs["Emission Color"].default_value = emit
        b.inputs["Emission Strength"].default_value = emit_strength
    return m


def assign(obj, mat):
    obj.data.materials.clear(); obj.data.materials.append(mat)


def camera(loc, target, lens=50, ortho=None):
    bpy.ops.object.camera_add(location=loc)
    cam = bpy.context.object
    direction = Vector(target) - Vector(loc)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = lens
    if ortho:
        cam.data.type = "ORTHO"; cam.data.ortho_scale = ortho
    bpy.context.scene.camera = cam
    return cam


def area_light(loc, target, energy, color=(1, 0.132, 0.064), size=4):
    bpy.ops.object.light_add(type="AREA", location=loc)
    l = bpy.context.object
    l.data.energy = energy; l.data.color = color; l.data.size = size
    l.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return l


def render(name):
    bpy.context.scene.render.filepath = os.path.join(OUT, name + ".png")
    bpy.ops.render.render(write_still=True)
    print("rendered", name)


def rounded_box(size, bevel, loc=(0, 0, 0), segs=6):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    mod = o.modifiers.new("b", "BEVEL"); mod.width = bevel; mod.segments = segs
    bpy.ops.object.shade_smooth()
    return o


# 1 · isometric network grid: every payment is a node on the grid ---------------
def scene_grid():
    reset(bg=(0.1, 0.0022, 0.004, 1))
    floor_mat = principled("floor", (0.12, 0.0022, 0.0048, 1), rough=0.35, emit=(0.5, 0.011, 0.0176, 1), emit_strength=0.25)
    bpy.ops.mesh.primitive_plane_add(size=14); assign(bpy.context.object, floor_mat)
    line = emission("line", (1, 0.066, 0.044, 1), 2.2)
    for i in range(-6, 7):
        for axis in (0, 1):
            bpy.ops.mesh.primitive_cube_add(size=1, location=(i * 1.2 if axis == 0 else 0, 0 if axis == 0 else i * 1.2, 0.01))
            o = bpy.context.object
            o.scale = (0.012, 14, 0.01) if axis == 0 else (14, 0.012, 0.01)
            assign(o, line)
    body = principled("node", (0.35, 0.0066, 0.0128, 1), rough=0.25, emit=(0.8, 0.022, 0.028, 1), emit_strength=0.5)
    top = emission("top", (1, 0.099, 0.052, 1), 3)
    red = emission("red", (1, 0.25, 0.1, 1), 4)
    nodes = [(-2.4, -1.2, .6), (0, -2.4, .9), (1.2, 0, 1.4), (-1.2, 1.2, .5), (2.4, 2.4, .8), (0, 1.2, 1.1), (-3.6, 0, .4), (2.4, -1.2, .5)]
    for k, (x, y, hgt) in enumerate(nodes):
        o = rounded_box((0.62, 0.62, hgt), 0.05, (x, y, hgt / 2)); assign(o, body)
        cap = rounded_box((0.5, 0.5, 0.04), 0.02, (x, y, hgt + 0.03)); assign(cap, red if k == 2 else top)
    # glowing links between nodes
    path = [(-3.6, 0), (-2.4, -1.2), (0, -2.4), (2.4, -1.2), (1.2, 0), (0, 1.2), (-1.2, 1.2), (2.4, 2.4)]
    for (x0, y0), (x1, y1) in zip(path, path[1:]):
        mid = ((x0 + x1) / 2, (y0 + y1) / 2, 0.03)
        ln = math.hypot(x1 - x0, y1 - y0)
        bpy.ops.mesh.primitive_cube_add(size=1, location=mid)
        o = bpy.context.object; o.scale = (ln, 0.05, 0.02); o.rotation_euler = (0, 0, math.atan2(y1 - y0, x1 - x0))
        assign(o, line)
    camera((9, -9, 9), (0, 0, 0.4), ortho=8.5)
    area_light((0, 0, 8), (0, 0, 0), 250, size=8)
    render("grid")


# 2 · the card as a dark glossy device with a glowing heartbeat ------------------
def scene_slab():
    reset(bg=(0.025, 0.00066, 0.0012, 1))
    slab = rounded_box((3.4, 2.14, 0.22), 0.12, (0, 0, 0.11), segs=10)
    assign(slab, principled("slab", (0.03, 0.0022, 0.0016, 1), rough=0.18, metal=0.6))
    rim = rounded_box((3.46, 2.2, 0.03), 0.12, (0, 0, 0.02), segs=10)
    assign(rim, emission("rim", (1, 0.055, 0.04, 1), 3))
    glow = emission("pulse", (1, 0.088, 0.0496, 1), 4)
    pts = [(-1.3, 0), (-0.45, 0), (-0.28, 0.3), (-0.1, -0.45), (0.1, 0.42), (0.27, 0), (1.3, 0)]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        ln = math.hypot(x1 - x0, y1 - y0)
        bpy.ops.mesh.primitive_cube_add(size=1, location=((x0 + x1) / 2, (y0 + y1) / 2, 0.235))
        o = bpy.context.object; o.scale = (ln + 0.03, 0.035, 0.01); o.rotation_euler = (0, 0, math.atan2(y1 - y0, x1 - x0))
        assign(o, glow)
    chip = rounded_box((0.45, 0.34, 0.02), 0.04, (-1.05, 0.55, 0.235)); assign(chip, principled("chip", (0.9, 0.78, 0.5, 1), rough=0.25, metal=1))
    bpy.ops.mesh.primitive_plane_add(size=30); assign(bpy.context.object, principled("ground", (0.03, 0.0011, 0.00144, 1), rough=0.45))
    camera((0, -6.2, 2.4), (0, 0.15, 0.1), lens=55)
    area_light((0, 3, 4), (0, 0, 0), 160, size=6)
    area_light((-4, -2, 2), (0, 0, 0), 120, color=(1, 0.11, 0.06), size=3)
    render("slab")


# 3 · glass capsules full of payments, one is fraud -----------------------------
def scene_capsules():
    reset(w=640, h=900, bg=(0.04, 0.00088, 0.002, 1))
    glass = principled("glass", (0.45, 0.0176, 0.02, 1), rough=0.12, transmission=1.0)
    ball = principled("ball", (0.6, 0.011, 0.02, 1), rough=0.3, emit=(1, 0.044, 0.036, 1), emit_strength=1.2)
    red = principled("redball", (1, 0.2, 0.08, 1), rough=0.3, emit=(1, 0.22, 0.06, 1), emit_strength=6)
    for x, n in ((-0.9, 5), (0.9, 6)):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.62, depth=3.6, location=(x, 0, 0))
        c = bpy.context.object
        mod = c.modifiers.new("b", "BEVEL"); mod.width = 0.55; mod.segments = 12
        bpy.ops.object.shade_smooth(); assign(c, glass)
        for k in range(n):
            bpy.ops.mesh.primitive_uv_sphere_add(radius=0.22, location=(x + math.sin(k * 2.1) * 0.22, math.cos(k * 1.7) * 0.15, -1.4 + k * 0.55))
            bpy.ops.object.shade_smooth()
            assign(bpy.context.object, red if (x > 0 and k == 3) else ball)
    camera((0, -7.5, 0.6), (0, 0, 0), lens=52)
    area_light((0, -3, 4), (0, 0, 0), 110, size=5)
    area_light((0, 3, 0), (0, 0, 0), 90, color=(1, 0.066, 0.044), size=5)
    render("capsules")


# 4 · eye + lock + shield icons in a pool of light --------------------------------
def scene_icons():
    reset(bg=(0.035, 0.00088, 0.00176, 1))
    neon = emission("neon", (1, 0.066, 0.044, 1), 3)
    # eye: two arcs and a pupil
    bpy.ops.mesh.primitive_torus_add(major_radius=0.9, minor_radius=0.05, location=(-1.6, 0, 0.6))
    e = bpy.context.object; e.scale = (1.35, 0.6, 1); e.rotation_euler = (math.pi / 2, 0, 0); assign(e, neon)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.32, minor_radius=0.06, location=(-1.6, 0, 0.6)); o = bpy.context.object; o.rotation_euler = (math.pi / 2, 0, 0); assign(o, neon)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.14, location=(-1.6, -0.05, 0.6)); assign(bpy.context.object, neon)
    # lock: body + shackle
    body = rounded_box((0.9, 0.3, 0.75), 0.08, (1.4, 0, 0.4)); assign(body, principled("lockb", (0.1, 0.0044, 0.0048, 1), rough=0.2, emit=(1, 0.066, 0.048, 1), emit_strength=0.6))
    bpy.ops.mesh.primitive_torus_add(major_radius=0.3, minor_radius=0.06, location=(1.4, 0, 0.85)); s = bpy.context.object; s.rotation_euler = (math.pi / 2, 0, 0); assign(s, neon)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.07, depth=0.12, location=(1.4, -0.16, 0.42)); k = bpy.context.object; k.rotation_euler = (math.pi / 2, 0, 0); assign(k, neon)
    # small floating nodes
    for x, z, r in ((-0.2, 1.5, .08), (0.4, 1.1, .06), (-2.8, 1.3, .07), (2.6, 1.6, .09), (0.1, 0.2, .05)):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=(x, 0.2, z)); assign(bpy.context.object, neon)
    bpy.ops.mesh.primitive_plane_add(size=30); assign(bpy.context.object, principled("ground", (0.06, 0.0022, 0.0028, 1), rough=0.2))
    camera((0, -7, 2.2), (0, 0, 0.7), lens=50)
    area_light((0, 0, 5), (0, 0, 0), 300, size=1.5)
    render("icons")


# 5 · ring with orbiting nodes ------------------------------------------------------
def scene_ring():
    reset(w=640, h=900, bg=(0.035, 0.00088, 0.00176, 1))
    bpy.ops.mesh.primitive_torus_add(major_radius=1.6, minor_radius=0.06, location=(0, 0, 0))
    r = bpy.context.object; r.rotation_euler = (math.radians(78), 0, math.radians(10)); assign(r, emission("ring", (1, 0.066, 0.044, 1), 3))
    ball = principled("orb", (0.6, 0.011, 0.0224, 1), rough=0.15, emit=(1, 0.055, 0.04, 1), emit_strength=1.4)
    for a, s in ((0.6, .38), (2.6, .28), (4.3, .22)):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=s, location=(math.cos(a) * 1.6, 0, math.sin(a) * 1.6 * 0.95))
        bpy.ops.object.shade_smooth(); assign(bpy.context.object, ball)
    camera((0, -7, 0.4), (0, 0, 0), lens=55)
    area_light((0, -3, 3), (0, 0, 0), 200, size=4)
    render("ring")


SCENES = {"grid": scene_grid, "slab": scene_slab, "capsules": scene_capsules, "icons": scene_icons, "ring": scene_ring}

if __name__ == "__main__":
    for name in (sys.argv[1:] or SCENES):
        SCENES[name]()
