"""Render actual exported geometry, including supplied terrain normals.

Run npm run check first, then:
  blender --background --python scripts/render-v05-reference.py

These are Blender geometry references, not browser screenshots. They omit the
browser PBR implementation, pixel/ocean/cloud shaders, atmosphere and UI.
"""
import json
import math
from pathlib import Path

import bpy
from mathutils import Quaternion, Vector

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'docs/previews/depth-v0.5.1'
SOURCE = ROOT / '.qa/world-v05.json'
WIDTH, HEIGHT = 960, 600
VISUAL_RADIUS = 1.20
INITIAL_VIEW = {'yaw': -.62, 'pitch': .18, 'distance': 3.65}
VIEWS = (
    ('default', {'sun': 140, 'fill': 30, 'brightness': 105,
                 'azimuth': -50, 'elevation': 38, 'warmth': .22}, INITIAL_VIEW),
    ('side', {'sun': 155, 'fill': 34, 'brightness': 105,
              'azimuth': 82, 'elevation': 30, 'warmth': .18}, INITIAL_VIEW),
    ('rear', {'sun': 140, 'fill': 30, 'brightness': 105,
              'azimuth': -50, 'elevation': 38, 'warmth': .22},
     {**INITIAL_VIEW, 'yaw': INITIAL_VIEW['yaw'] + math.pi}),
)


def values(data):
    return list(data.values()) if isinstance(data, dict) else data


def to_blender(vector):
    # Babylon uses +Y up, and its camera looks from +Z toward the origin.
    return vector[0], -vector[2], vector[1]


def mesh_object(name, data, planet):
    positions, indices = values(data['positions']), values(data['indices'])
    vertices = [to_blender(positions[j:j + 3]) for j in range(0, len(positions), 3)]
    faces = [indices[j:j + 3] for j in range(0, len(indices), 3)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    if 'normals' in data:
        normals = values(data['normals'])
        if len(normals) != len(positions) or not all(math.isfinite(x) for x in normals):
            raise ValueError(f'{name}: invalid exported normals')
        converted = [to_blender(normals[j:j + 3]) for j in range(0, len(normals), 3)]
        if hasattr(mesh, 'use_auto_smooth'):
            mesh.use_auto_smooth = True  # Required for custom normals in Blender 4.0.
        # Preserve finite-difference normals at duplicated cube-face edges.
        mesh.normals_split_custom_set([converted[loop.vertex_index] for loop in mesh.loops])
        assert mesh.has_custom_normals, f'{name}: custom normals were not applied'
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = planet
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = .95 if name == 'land' else .32 if name == 'rivers' else .27
    if 'colors' in data:
        colors = values(data['colors'])
        layer = mesh.color_attributes.new(name='SurfaceColor', type='FLOAT_COLOR', domain='POINT')
        for j, vertex in enumerate(layer.data):
            vertex.color = colors[j * 4:j * 4 + 4]
        color = material.node_tree.nodes.new('ShaderNodeVertexColor')
        color.layer_name = 'SurfaceColor'
        material.node_tree.links.new(color.outputs['Color'], bsdf.inputs['Base Color'])
    else:
        # #64b3ad in linear RGB, as used by the river PBR material.
        bsdf.inputs['Base Color'].default_value = (.1274, .4508, .4179, 1)
    obj.data.materials.append(material)
    return {'vertices': len(vertices), 'triangles': len(faces),
            'exported_normals': 'normals' in data}


source = json.loads(SOURCE.read_text())
OUTPUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
planet = bpy.data.objects.new('Planet', None)
bpy.context.collection.objects.link(planet)
planet.rotation_mode = 'QUATERNION'
mesh_stats = {key: mesh_object(key, source[key], planet) for key in ('land', 'ocean', 'rivers')}

world = bpy.data.worlds.new('Sky')
world.use_nodes = True
bpy.context.scene.world = world
nodes, links = world.node_tree.nodes, world.node_tree.links
environment = nodes.new('ShaderNodeTexEnvironment')
environment.image = bpy.data.images.load(str(ROOT / 'dist/assets/coastal-sky-v0.4.hdr'))
environment_background = nodes.get('Background')
links.new(environment.outputs['Color'], environment_background.inputs['Color'])
camera_background = nodes.new('ShaderNodeBackground')
camera_background.inputs['Color'].default_value = (.44, .62, .73, 1)
path = nodes.new('ShaderNodeLightPath')
mix = nodes.new('ShaderNodeMixShader')
links.new(path.outputs['Is Camera Ray'], mix.inputs[0])
links.new(environment_background.outputs[0], mix.inputs[1])
links.new(camera_background.outputs[0], mix.inputs[2])
links.new(mix.outputs[0], nodes['World Output'].inputs['Surface'])

sun_data = bpy.data.lights.new('Sun', 'SUN')
sun_data.angle = math.radians(4)
sun = bpy.data.objects.new('Sun', sun_data)
bpy.context.collection.objects.link(sun)
camera_data = bpy.data.cameras.new('Camera')
camera = bpy.data.objects.new('Camera', camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (0, -INITIAL_VIEW['distance'], 0)
camera.rotation_euler = (-camera.location).to_track_quat('-Z', 'Y').to_euler()
camera_data.sensor_fit = 'VERTICAL'
camera_data.sensor_height = 24
# Match framePlanet() rather than using an arbitrary focal length.
usable = max(min(WIDTH, HEIGHT) * .4, min(WIDTH - 40, HEIGHT - 132))
fraction = min(1, usable / min(WIDTH, HEIGHT))
tan_half_fov = (VISUAL_RADIUS / 1.095) / (2.7 * fraction)
camera_data.lens = camera_data.sensor_height / (2 * tan_half_fov)

scene = bpy.context.scene
scene.camera = camera
scene.render.engine = 'CYCLES'
scene.cycles.samples = 96
scene.cycles.use_denoising = False  # This environment has no OpenImageDenoise.
scene.render.resolution_x = WIDTH
scene.render.resolution_y = HEIGHT
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.render.image_settings.file_format = 'PNG'
# Keep the limitation on each image when shared independently of the docs.
scene.render.use_stamp = True
scene.render.use_stamp_labels = False
for option in ('date', 'time', 'render_time', 'frame', 'frame_range', 'memory',
               'hostname', 'camera', 'lens', 'scene', 'marker', 'filename', 'sequencer_strip'):
    prop = 'use_stamp_' + option
    if hasattr(scene.render, prop):
        setattr(scene.render, prop, False)
scene.render.use_stamp_note = True
scene.render.stamp_font_size = 13
scene.render.stamp_foreground = (1, 1, 1, 1)
scene.render.stamp_background = (.035, .055, .07, .8)

for name, light, view in VIEWS:
    planet.rotation_quaternion = (Quaternion((1, 0, 0), view['pitch'])
                                  @ Quaternion((0, 0, 1), view['yaw']))
    azimuth, elevation = math.radians(light['azimuth']), math.radians(light['elevation'])
    direction = Vector((math.sin(azimuth) * math.cos(elevation),
                        -math.cos(azimuth) * math.cos(elevation), math.sin(elevation)))
    sun.rotation_euler = (-direction).to_track_quat('-Z', 'Y').to_euler()
    sun_data.energy = light['sun'] * .031
    neutral, warm = (1, .99, .96), (1.12, .86, .62)
    sun_data.color = tuple(a + (b - a) * light['warmth'] for a, b in zip(neutral, warm))
    environment_background.inputs['Strength'].default_value = light['fill'] * .012
    # Blender exposure is expressed in stops; Babylon uses a multiplier.
    scene.view_settings.exposure = math.log2(light['brightness'] * .01)
    scene.render.stamp_note_text = (f'BLENDER GEOMETRY REFERENCE | {name.upper()} | '
                                    'browser shaders, clouds, atmosphere and UI omitted')
    scene.render.filepath = str(OUTPUT / f'geometry-{name}.png')
    bpy.ops.render.render(write_still=True)

(OUTPUT / 'geometry-reference.json').write_text(json.dumps({
    'kind': 'Blender geometry reference; not a browser screenshot',
    'source': str(SOURCE.relative_to(ROOT)),
    'limitations': ['Different PBR and tone mapping from Babylon.js',
                    'No pixel/ocean/cloud shader, atmosphere or UI',
                    'HDR fill approximates browser ambient lighting'],
    'meshes': mesh_stats, 'visual_radius': VISUAL_RADIUS,
    'vertical_fov_degrees': math.degrees(2 * math.atan(tan_half_fov)),
    'views': {name: {'light': light, 'view': view} for name, light, view in VIEWS},
}, indent=2) + '\n')
