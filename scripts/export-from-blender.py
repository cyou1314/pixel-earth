"""Export an edited authoring project to a new folder; never overwrite it."""
import bpy
from pathlib import Path
from datetime import datetime

root = Path(__file__).resolve().parents[1]
output = root / "authoring" / "exports" / datetime.now().strftime("%Y%m%d_%H%M%S_%f")
output.mkdir(parents=True, exist_ok=False)
planet = bpy.data.objects.get("Planet")
if planet is None:
    raise RuntimeError('The project needs the original "Planet" object.')
saved_matrix = planet.matrix_basis.copy()
planet.rotation_mode = "QUATERNION"
planet.rotation_quaternion = (1, 0, 0, 0)
bpy.ops.object.select_all(action="DESELECT")
planet.select_set(True)
for obj in planet.children_recursive:
    obj.select_set(True)
try:
    bpy.ops.export_scene.gltf(filepath=str(output / "planet.glb"), export_format="GLB",
                             use_selection=True, export_cameras=False, export_lights=False, export_apply=True)
finally:
    planet.matrix_basis = saved_matrix
print("Exported the edited planet to " + str(output / "planet.glb"))
