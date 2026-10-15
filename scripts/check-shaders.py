"""Optional Linux EGL shader check after npm run check; no browser required.

Uses Babylon's actual prepared PBR sources. Desktop GLSL adaptations are
reported explicitly; this does not verify WebGL pixels or browser behaviour.
"""
import ctypes as C
import ctypes.util
import json
import re
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--v05', action='store_true', help='Check all five v0.5 shader programs')
args = parser.parse_args()
shader_directory = ROOT / ('.qa/v05-shaders' if args.v05 else '.qa/shaders')
report_path = ROOT / ('docs/previews/world-v0.5/shader-validation.json' if args.v05 else 'docs/previews/polish-v0.4.1/shader-validation.json')
egl = C.CDLL(ctypes.util.find_library("EGL"))
gl = C.CDLL(ctypes.util.find_library("GL"))
P, I, U = C.c_void_p, C.c_int, C.c_uint


def api(lib, name, ret, args):
    fn = getattr(lib, name)
    fn.restype, fn.argtypes = ret, args
    return fn


getproc = api(egl, "eglGetProcAddress", P, [C.c_char_p])
address = getproc(b"eglGetPlatformDisplayEXT")
if not address:
    raise RuntimeError("EGL surfaceless display is unavailable")
display = C.CFUNCTYPE(P, U, P, C.POINTER(I))(address)(0x31DD, None, None)
if not api(egl, "eglInitialize", U, [P, C.POINTER(I), C.POINTER(I)])(display, C.byref(I()), C.byref(I())):
    raise RuntimeError("EGL initialization failed")
try:
    assert api(egl, "eglBindAPI", U, [U])(0x30A2)
    config, count = P(), I()
    attrs = (I * 9)(0x3033, 1, 0x3040, 8, 0x3024, 8, 0x3025, 0, 0x3038)
    assert api(egl, "eglChooseConfig", U, [P, C.POINTER(I), C.POINTER(P), I, C.POINTER(I)])(display, attrs, C.byref(config), 1, C.byref(count)) and count.value
    surface = api(egl, "eglCreatePbufferSurface", P, [P, P, C.POINTER(I)])(display, config, (I * 5)(0x3057, 1, 0x3056, 1, 0x3038))
    context = api(egl, "eglCreateContext", P, [P, P, P, C.POINTER(I)])(display, config, None, (I * 1)(0x3038))
    assert surface and context and api(egl, "eglMakeCurrent", U, [P, P, P, P])(display, surface, surface, context)

    def compile_shader(kind, source):
        source = re.sub(r"^\s*#extension[^\n]*\n", "", source, flags=re.M)
        source = "#version 330 compatibility\n#define textureCubeLodEXT textureLod\n#define texture2DLodEXT textureLod\n#define texture2DGradEXT textureGrad\n" + source
        shader = api(gl, "glCreateShader", U, [U])(kind)
        raw = source.encode()
        pointer, size = C.c_char_p(raw), I(len(raw))
        api(gl, "glShaderSource", None, [U, I, C.POINTER(C.c_char_p), C.POINTER(I)])(shader, 1, C.byref(pointer), C.byref(size))
        api(gl, "glCompileShader", None, [U])(shader)
        ok = I()
        api(gl, "glGetShaderiv", None, [U, U, C.POINTER(I)])(shader, 0x8B81, C.byref(ok))
        if not ok.value:
            log = C.create_string_buffer(16384)
            api(gl, "glGetShaderInfoLog", None, [U, I, C.POINTER(I), P])(shader, len(log), None, log)
            raise RuntimeError(log.value.decode())
        return shader

    report = {"context": "surfaceless EGL desktop OpenGL, not browser WebGL", "programs": {}}
    for name in (('Land', 'Ocean', 'Rivers', 'Clouds', 'Atmosphere') if args.v05 else ('Land', 'Ocean')):
        program = api(gl, "glCreateProgram", U, [])()
        for ext, kind in (("vert", 0x8B31), ("frag", 0x8B30)):
            shader = compile_shader(kind, (shader_directory / f"{name}.{ext}").read_text())
            api(gl, "glAttachShader", None, [U, U])(program, shader)
        api(gl, "glLinkProgram", None, [U])(program)
        ok = I()
        api(gl, "glGetProgramiv", None, [U, U, C.POINTER(I)])(program, 0x8B82, C.byref(ok))
        if not ok.value:
            log = C.create_string_buffer(16384)
            api(gl, "glGetProgramInfoLog", None, [U, I, C.POINTER(I), P])(program, len(log), None, log)
            raise RuntimeError(log.value.decode())
        report["programs"][name] = {"vertex_compile": "passed", "fragment_compile": "passed", "link": "passed"}
    report["adaptation"] = "Babylon WebGLShaderProcessor used in NullEngine; GLSL 330 compatibility, WebGL extension directives removed and EXT texture names mapped to core functions."
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))
finally:
    api(egl, "eglTerminate", U, [P])(display)
