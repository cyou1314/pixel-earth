"""Create the editable planet, its glTF asset, and an original sky environment.

Run: blender --background --python scripts/blender-scene.py
The .blend is an authoring file; the website loads the exported .glb.
"""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector, Quaternion

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "dist" / "assets"
AUTHORING = ROOT / "authoring"
ASSETS.mkdir(parents=True, exist_ok=True)
AUTHORING.mkdir(parents=True, exist_ok=True)
if "--replace-generated" not in sys.argv and any(p.exists() for p in (
        AUTHORING / "pixel-earth-v0.3.blend", ASSETS / "planet.glb")):
    raise RuntimeError("Generated assets already exist. Export edits to a new folder, or explicitly use --replace-generated to rebuild the baseline.")


def fract(x):
    return x - math.floor(x)


def mix(a, b, t):
    return a * (1 - t) + b * t


def smooth(a, b, x):
    t = max(0, min(1, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def hash3(p):
    p = [fract(v * 0.1031) for v in p]
    d = sum(p[k] * (p[(k + 1) % 3] + 33.33) for k in range(3))
    p = [v + d for v in p]
    return fract((p[0] + p[1]) * p[2])


def noise(p):
    i = [math.floor(v) for v in p]
    f = [v - math.floor(v) for v in p]
    f = [v * v * (3 - 2 * v) for v in f]
    v = [hash3([i[0] + x, i[1] + y, i[2] + z])
         for z in range(2) for y in range(2) for x in range(2)]
    return mix(mix(mix(v[0], v[1], f[0]), mix(v[2], v[3], f[0]), f[1]),
               mix(mix(v[4], v[5], f[0]), mix(v[6], v[7], f[0]), f[1]), f[2])


MASSES = [((0.62, 0.20, 0.75), 5.1, 1),
          ((0.18, 0.69, 0.49), 6.5, 0.8),
          ((-0.72, 0.19, 0.34), 6.2, 0.95),
          ((0.3, -0.46, -0.74), 4.4, 0.84),
          ((-0.6, 0.62, -0.75), 5.9, 0.75)]
MASSES = [(Vector(c).normalized(), width, strength) for c, width, strength in MASSES]


def terrain(n):
    shape = sum(strength * math.exp(-sum((n[k] - c[k]) ** 2 for k in range(3)) * width)
                for c, width, strength in MASSES)
    p = [n[k] * 5 + (3, 7, 1)[k] for k in range(3)]
    total, amp = 0, 0.55
    for _ in range(4):
        total += amp * (noise(p) - 0.5)
        p = [p[k] * 2.03 + (9.7, 13.1, 5.2)[k] for k in range(3)]
        amp *= 0.5
    return shape - 0.54 + total * 0.42


def linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def color_mix(a, b, t):
    return tuple(linear(mix(a[k], b[k], t)) for k in range(3)) + (1,)


def material(name, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Metallic"].default_value = 0
    shader.inputs["Roughness"].default_value = roughness
    if "Specular IOR Level" in shader.inputs:
        shader.inputs["Specular IOR Level"].default_value = 0.35
    elif "Specular" in shader.inputs:
        shader.inputs["Specular"].default_value = 0.35
    vertex = mat.node_tree.nodes.new("ShaderNodeVertexColor")
    vertex.layer_name = "SurfaceColor"
    mat.node_tree.links.new(vertex.outputs["Color"], shader.inputs["Base Color"])
    return mat


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
land_mat = material("Land · matte", 0.94)
water_mat = material("Ocean · water", 0.26)
water_shader = water_mat.node_tree.nodes.get("Principled BSDF")
water_shader.inputs["IOR"].default_value = 1.333

# A small, seamless normal map. Texture values carry normals, not painted light.
normal = bpy.data.images.new("Water normals", width=128, height=128, alpha=False)
normal.colorspace_settings.name = "Non-Color"
pixels = []
for y in range(128):
    for x in range(128):
        u, v = x / 128, y / 128
        nx = ny = 0
        for fx, fy, a in [(3, 1, 0.32), (1, 5, 0.19), (7, -2, 0.10)]:
            t = math.cos(2 * math.pi * (fx * u + fy * v)) * a
            nx += t * fx / 7
            ny += t * fy / 7
        n = Vector((-nx, -ny, 1)).normalized()
        pixels.extend((n.x * 0.5 + 0.5, n.y * 0.5 + 0.5, n.z * 0.5 + 0.5, 1))
normal.pixels[:] = pixels
normal.filepath_raw = str(ASSETS / "water-normal.png")
normal.file_format = "PNG"
normal.save()
nodes = water_mat.node_tree.nodes
tex = nodes.new("ShaderNodeTexImage")
tex.image = normal
normal_node = nodes.new("ShaderNodeNormalMap")
normal_node.inputs["Strength"].default_value = 0.16
water_mat.node_tree.links.new(tex.outputs["Color"], normal_node.inputs["Color"])
water_mat.node_tree.links.new(normal_node.outputs["Normal"], water_shader.inputs["Normal"])

planet = bpy.data.objects.new("Planet", None)
bpy.context.collection.objects.link(planet)


def sphere(name, lat_count, lon_count, is_land):
    verts, faces, colors, uv_coords = [], [], [], []
    for j in range(lat_count + 1):
        theta = math.pi * j / lat_count
        for i in range(lon_count + 1):
            phi = 2 * math.pi * i / lon_count
            n = (math.sin(theta) * math.cos(phi), math.cos(theta), math.sin(theta) * math.sin(phi))
            h = terrain(n)
            radius = 1 + h * 0.10 if is_land else 1
            verts.append((n[0] * radius, -n[2] * radius, n[1] * radius))
            if is_land:
                inland = color_mix((0.43, 0.56, 0.40), (0.61, 0.66, 0.47), smooth(0, 0.62, h))
                sand = tuple(linear(c) for c in (0.66, 0.65, 0.48)) + (1,)
                coast = smooth(0.006, 0.06, h)
                color = tuple(mix(sand[k], inland[k], coast) for k in range(4))
            else:
                color = color_mix((0.17, 0.38, 0.46), (0.24, 0.52, 0.54), smooth(-0.16, 0.02, h))
            colors.append(color)
            uv_coords.append((i / lon_count * (20 if not is_land else 1),
                              j / lat_count * (10 if not is_land else 1)))
    stride = lon_count + 1
    for j in range(lat_count):
        for i in range(lon_count):
            a, b = j * stride + i, (j + 1) * stride + i
            if j == 0:
                faces.append((a, b + 1, b))
            elif j == lat_count - 1:
                faces.append((a, a + 1, b))
            else:
                faces.append((a, a + 1, b + 1, b))
    mesh = bpy.data.meshes.new(name + " Geometry")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    uv = mesh.uv_layers.new(name="UVMap")
    col = mesh.color_attributes.new(name="SurfaceColor", type="FLOAT_COLOR", domain="POINT")
    for i, color in enumerate(colors):
        col.data[i].color = color
    for polygon in mesh.polygons:
        polygon.use_smooth = True
        for loop_index in polygon.loop_indices:
            uv.data[loop_index].uv = uv_coords[mesh.loops[loop_index].vertex_index]
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = planet
    obj.data.materials.append(land_mat if is_land else water_mat)
    return obj


land = sphere("Land", 80, 160, True)
ocean = sphere("Ocean", 48, 96, False)

# Original HDR environment, kept as a real asset and editable in the .blend.
sky = bpy.data.images.new("Afternoon sky", width=512, height=256, float_buffer=True, alpha=False)
sky_pixels = []
for y in range(256):
    height = -math.cos(math.pi * (y + 0.5) / 256)
    for x in range(512):
        if height >= 0:
            rgb = tuple(mix(a, b, height ** 0.48) for a, b in zip((1.15, 1.35, 1.45), (0.36, 0.65, 1.03)))
        else:
            rgb = tuple(mix(a, b, (-height) ** 0.55) for a, b in zip((0.64, 0.72, 0.74), (0.18, 0.22, 0.25)))
        sky_pixels.extend((*rgb, 1))
sky.pixels[:] = sky_pixels
sky.filepath_raw = str(ASSETS / "afternoon-sky.hdr")
sky.file_format = "HDR"
sky.save()

world = bpy.data.worlds.new("Afternoon environment")
world.use_nodes = True
bpy.context.scene.world = world
env = world.node_tree.nodes.new("ShaderNodeTexEnvironment")
env.image = sky
background = world.node_tree.nodes.get("Background")
background.inputs["Strength"].default_value = 0.65
world.node_tree.links.new(env.outputs["Color"], background.inputs["Color"])

sun_data = bpy.data.lights.new("Sun", "SUN")
sun_data.energy = 3.1
sun_data.angle = math.radians(4)
sun_data.color = (1, 0.94, 0.82)
sun = bpy.data.objects.new("Sun", sun_data)
bpy.context.collection.objects.link(sun)
az, el = math.radians(-38), math.radians(42)
direction = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
sun.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
sun.location = direction * 4

camera_data = bpy.data.cameras.new("Camera")
camera = bpy.data.objects.new("Camera", camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (0, -3.65, 0)
camera.rotation_euler = (-camera.location).to_track_quat("-Z", "Y").to_euler()
camera_data.sensor_fit = "VERTICAL"
camera_data.sensor_height = 24
camera_data.lens = 32.4
bpy.context.scene.camera = camera

# Neutral asset transform makes the same file usable in either editor.
bpy.ops.object.select_all(action="DESELECT")
for obj in (planet, land, ocean):
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ASSETS / "planet.glb"), export_format="GLB", use_selection=True,
                          export_cameras=False, export_lights=False, export_apply=True)

# The authoring project opens at the accepted view, with camera and light ready.
planet.rotation_mode = "QUATERNION"
planet.rotation_quaternion = Quaternion((1, 0, 0), 0.18) @ Quaternion((0, 0, 1), -0.62)
scene = bpy.context.scene
scene.render.resolution_x = 1280
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.render.engine = "CYCLES"
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.view_settings.view_transform = "AgX" if bpy.app.version >= (4, 0, 0) else "Filmic"
scene.view_settings.look = "Medium High Contrast" if bpy.app.version < (4, 0, 0) else "AgX - Medium High Contrast"
scene.render.image_settings.file_format = "PNG"
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(AUTHORING / "pixel-earth-v0.3.blend"), compress=True)

manifest = {
    "version": "0.3.0", "generator": "Blender " + bpy.app.version_string,
    "geometry": {obj.name: {"vertices": len(obj.data.vertices), "polygons": len(obj.data.polygons)} for obj in (land, ocean)},
    "source": "authoring/pixel-earth-v0.3.blend", "runtime": "dist/assets/planet.glb",
    "environment": "dist/assets/afternoon-sky.hdr", "asset_origin": "Original assets created for Pixel Earth",
    "note": "Original procedural assets. Blender reference rendering is not a browser screenshot."
}
(AUTHORING / "asset-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print("PLANET_ASSETS_READY " + json.dumps(manifest))
