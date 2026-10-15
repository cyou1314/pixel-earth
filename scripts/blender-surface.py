"""Build v0.4 beside the retained v0.3 source and runtime assets.

blender --background --python scripts/blender-surface.py -- --sky /path/to/1k.hdr
Use --replace-generated only to revise this generated v0.4 baseline.
"""
import bpy
import json
import math
import sys
import importlib.util
from pathlib import Path
from mathutils import Vector, Quaternion

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("terrain_surface", ROOT / "scripts/terrain-surface.py")
terrain = importlib.util.module_from_spec(spec)
spec.loader.exec_module(terrain)
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if "--sky" not in args:
    raise RuntimeError("Supply the verified Poly Haven 1K HDR with --sky; see docs/ASSETS.md.")
sky_path = Path(args[args.index("--sky") + 1]).resolve()
ASSETS = ROOT / "dist/assets"
AUTHORING = ROOT / "authoring"
blend_path = AUTHORING / "pixel-earth-v0.4.blend"
glb_path = ASSETS / "planet-v0.4.glb"
if "--replace-generated" not in args and (blend_path.exists() or glb_path.exists()):
    raise RuntimeError("v0.4 baseline already exists. Save edits separately or explicitly rebuild this baseline.")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)


def material(name, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Metallic"].default_value = 0
    shader.inputs["Roughness"].default_value = roughness
    vertex = mat.node_tree.nodes.new("ShaderNodeVertexColor")
    vertex.layer_name = "SurfaceColor"
    mat.node_tree.links.new(vertex.outputs["Color"], shader.inputs["Base Color"])
    return mat


land_mat = material("Land · layered natural greens", .90)
water_mat = material("Ocean · depth and sky", .20)
water_shader = water_mat.node_tree.nodes.get("Principled BSDF")
water_shader.inputs["IOR"].default_value = 1.333
water_shader.inputs["Specular IOR Level"].default_value = .5

planet = bpy.data.objects.new("Planet", None)
bpy.context.collection.objects.link(planet)


def sphere(name, lat_count, lon_count, land):
    verts, faces, colors, uv_coords = [], [], [], []
    for j in range(lat_count + 1):
        theta = math.pi * j / lat_count
        for i in range(lon_count + 1):
            phi = 2 * math.pi * i / lon_count
            n = (math.sin(theta) * math.cos(phi), math.cos(theta), math.sin(theta) * math.sin(phi))
            coast, height, upland = terrain.surface(n)
            radius = 1 + height if land else 1
            verts.append((n[0] * radius, -n[2] * radius, n[1] * radius))
            colors.append(terrain.surface_color(n, coast, height, upland, land))
            uv_coords.append((i / lon_count, j / lat_count))
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
    mesh.update()
    # UV duplicates must share shading normals. Otherwise glossy seas expose a
    # meridian seam, and the pole fans produce tiny star-shaped highlights.
    normals = [Vector(v.normal) for v in mesh.vertices]
    if land:
        for j in range(1, lat_count):
            a, b = j * stride, j * stride + lon_count
            normals[a] = normals[b] = (normals[a] + normals[b]).normalized()
        for i in range(lon_count + 1):
            normals[i] = Vector((0, 0, 1))
            normals[lat_count * stride + i] = Vector((0, 0, -1))
    else:
        normals = [Vector(v).normalized() for v in verts]
    mesh.use_auto_smooth = True
    mesh.normals_split_custom_set_from_vertices(normals)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = planet
    obj.data.materials.append(land_mat if land else water_mat)
    return obj


land = sphere("Land", 144, 288, True)
ocean = sphere("Ocean", 96, 192, False)

# Self-hosted, optimised derivative. Keep the old original HDR untouched.
sky = bpy.data.images.load(str(sky_path), check_existing=False)
sky.name = "Poly Haven · Kloofendal sky · optimised"
sky.scale(1024, 512)
pixels = list(sky.pixels)
for i in range(0, len(pixels), 4):
    peak = max(pixels[i:i+3])
    if peak > 18:
        for k in range(3):
            pixels[i+k] *= 18 / peak
sky.pixels[:] = pixels
sky.filepath_raw = str(ASSETS / "coastal-sky-v0.4.hdr")
sky.file_format = "HDR"
sky.save()
world = bpy.data.worlds.new("Coastal afternoon")
world.use_nodes = True
bpy.context.scene.world = world
nodes, links = world.node_tree.nodes, world.node_tree.links
env = nodes.new("ShaderNodeTexEnvironment")
env.image = sky
background = nodes.get("Background")
background.inputs["Strength"].default_value = .65
links.new(env.outputs["Color"], background.inputs["Color"])
# Camera sees a quiet blue backdrop; HDR remains available to reflection rays.
camera_sky = nodes.new("ShaderNodeBackground")
camera_sky.inputs["Color"].default_value = (.44, .62, .73, 1)
camera_sky.inputs["Strength"].default_value = 1
path = nodes.new("ShaderNodeLightPath")
mix = nodes.new("ShaderNodeMixShader")
links.new(path.outputs["Is Camera Ray"], mix.inputs[0])
links.new(background.outputs[0], mix.inputs[1])
links.new(camera_sky.outputs[0], mix.inputs[2])
links.new(mix.outputs[0], nodes.get("World Output").inputs["Surface"])

sun_data = bpy.data.lights.new("Sun", "SUN")
sun_data.energy = 3.4
sun_data.angle = math.radians(3)
sun_data.color = (1, .95, .84)
sun = bpy.data.objects.new("Sun", sun_data)
bpy.context.collection.objects.link(sun)
az, el = math.radians(32), math.radians(42)
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

# Web waves are a PBR material plugin, not an exported normal-map texture.
# Export the clean asset first; add a matching procedural ripple reference in Blender.
bpy.ops.object.select_all(action="DESELECT")
for obj in (planet, land, ocean):
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(glb_path), export_format="GLB", use_selection=True,
                          export_cameras=False, export_lights=False, export_apply=True)

nodes, links = water_mat.node_tree.nodes, water_mat.node_tree.links
coord = nodes.new("ShaderNodeTexCoord")
noise = nodes.new("ShaderNodeTexNoise")
noise.inputs["Scale"].default_value = 65
noise.inputs["Detail"].default_value = 2
noise.inputs["Roughness"].default_value = .4
links.new(coord.outputs["Generated"], noise.inputs["Vector"])
bump = nodes.new("ShaderNodeBump")
bump.inputs["Strength"].default_value = .16
bump.inputs["Distance"].default_value = .009
links.new(noise.outputs["Fac"], bump.inputs["Height"])
links.new(bump.outputs["Normal"], water_shader.inputs["Normal"])

planet.rotation_mode = "QUATERNION"
planet.rotation_quaternion = Quaternion((1, 0, 0), .18) @ Quaternion((0, 0, 1), -.62)
scene = bpy.context.scene
scene.render.resolution_x = 1280
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.render.engine = "CYCLES"
scene.cycles.samples = 128
scene.cycles.use_denoising = False
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.render.image_settings.file_format = "PNG"
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), compress=True)

manifest = {
    "version": "0.4.0", "generator": "Blender " + bpy.app.version_string,
    "geometry": {o.name: {"vertices": len(o.data.vertices), "polygons": len(o.data.polygons)} for o in (land, ocean)},
    "land_coverage": {"method": "20000 equal-area Fibonacci directions", "fraction": terrain.coverage()},
    "source": "authoring/pixel-earth-v0.4.blend", "runtime": "dist/assets/planet-v0.4.glb",
    "environment": "dist/assets/coastal-sky-v0.4.hdr",
    "asset_origin": {"geometry": "Original procedural terrain", "sky": "Poly Haven CC0; see docs/ASSETS.md"},
    "note": "Blender reference differs from runtime waves; not a browser screenshot. v0.3 source and assets retained."
}
(AUTHORING / "asset-manifest-v0.4.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print("SURFACE_ASSETS_READY " + json.dumps(manifest))
