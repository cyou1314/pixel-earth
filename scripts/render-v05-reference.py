"""Render actual v0.5 geometry after npm run check; no browser or pixel/cloud shader recreation.

Run: blender --background --python scripts/render-v05-reference.py
"""
import bpy, json, math
from pathlib import Path
from mathutils import Vector, Quaternion
root=Path(__file__).resolve().parents[1]
source=json.loads((root/'.qa/world-v05.json').read_text())
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
planet=bpy.data.objects.new('Planet',None);bpy.context.collection.objects.link(planet)
for key in ('land','ocean','rivers'):
 d=source[key]
 values=lambda v:list(v.values()) if isinstance(v,dict) else v
 p=values(d['positions']);i=values(d['indices'])
 verts=[(p[j],-p[j+2],p[j+1]) for j in range(0,len(p),3)]
 faces=[i[j:j+3] for j in range(0,len(i),3)]
 mesh=bpy.data.meshes.new(key);mesh.from_pydata(verts,[],faces);mesh.update()
 for polygon in mesh.polygons:polygon.use_smooth=True
 obj=bpy.data.objects.new(key,mesh);bpy.context.collection.objects.link(obj);obj.parent=planet
 mat=bpy.data.materials.new(key);mat.use_nodes=True;bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.95 if key=='land' else .27
 if 'colors' in d:
  colors=values(d['colors']);layer=mesh.color_attributes.new(name='SurfaceColor',type='FLOAT_COLOR',domain='POINT')
  for j,v in enumerate(layer.data):v.color=colors[j*4:j*4+4]
  color=mat.node_tree.nodes.new('ShaderNodeVertexColor');color.layer_name='SurfaceColor';mat.node_tree.links.new(color.outputs['Color'],bsdf.inputs['Base Color'])
 else:bsdf.inputs['Base Color'].default_value=(.127,.451,.418,1)
 obj.data.materials.append(mat)
planet.rotation_mode='QUATERNION';planet.rotation_quaternion=Quaternion((1,0,0),.18)@Quaternion((0,0,1),-.62)
world=bpy.data.worlds.new('Sky');world.use_nodes=True;bpy.context.scene.world=world
tex=world.node_tree.nodes.new('ShaderNodeTexEnvironment');tex.image=bpy.data.images.load(str(root/'dist/assets/coastal-sky-v0.4.hdr'));world.node_tree.links.new(tex.outputs['Color'],world.node_tree.nodes['Background'].inputs['Color']);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65
camera_sky=world.node_tree.nodes.new('ShaderNodeBackground');camera_sky.inputs['Color'].default_value=(.44,.62,.73,1)
path=world.node_tree.nodes.new('ShaderNodeLightPath');mix=world.node_tree.nodes.new('ShaderNodeMixShader')
world.node_tree.links.new(path.outputs['Is Camera Ray'],mix.inputs[0]);world.node_tree.links.new(world.node_tree.nodes['Background'].outputs[0],mix.inputs[1]);world.node_tree.links.new(camera_sky.outputs[0],mix.inputs[2]);world.node_tree.links.new(mix.outputs[0],world.node_tree.nodes['World Output'].inputs['Surface'])
light=bpy.data.lights.new('Sun','SUN');light.energy=3.4;light.angle=math.radians(4);light.color=(1,.95,.84)
sun=bpy.data.objects.new('Sun',light);bpy.context.collection.objects.link(sun)
az,el=math.radians(32),math.radians(42);direction=Vector((math.sin(az)*math.cos(el),-math.cos(az)*math.cos(el),math.sin(el)));sun.rotation_euler=(-direction).to_track_quat('-Z','Y').to_euler()
cam_data=bpy.data.cameras.new('Camera');cam=bpy.data.objects.new('Camera',cam_data);bpy.context.collection.objects.link(cam);cam.location=(0,-3.65,0);cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();cam_data.sensor_fit='VERTICAL';cam_data.sensor_height=24;cam_data.lens=32.4
scene=bpy.context.scene;scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.samples=96;scene.cycles.use_denoising=False
scene.render.resolution_x=960;scene.render.resolution_y=600;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.render.image_settings.file_format='PNG';scene.render.filepath=str(root/'docs/previews/world-v0.5/geometry-reference.png');bpy.ops.render.render(write_still=True)
