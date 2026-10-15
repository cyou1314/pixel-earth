"""Deterministic, unit-sphere terrain; independent of Blender and rendering."""
import math


def mix(a, b, t):
    return a * (1 - t) + b * t


def smooth(a, b, x):
    t = max(0, min(1, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def normalized(p):
    length = math.sqrt(sum(x * x for x in p))
    return tuple(x / length for x in p)


def hash3(p):
    p = [(v * .1031) % 1 for v in p]
    d = sum(p[k] * (p[(k + 1) % 3] + 33.33) for k in range(3))
    p = [v + d for v in p]
    return ((p[0] + p[1]) * p[2]) % 1


def noise(p):
    i = [math.floor(v) for v in p]
    f = [v - math.floor(v) for v in p]
    f = [v * v * (3 - 2 * v) for v in f]
    v = [hash3([i[0] + x, i[1] + y, i[2] + z])
         for z in range(2) for y in range(2) for x in range(2)]
    return mix(mix(mix(v[0], v[1], f[0]), mix(v[2], v[3], f[0]), f[1]),
               mix(mix(v[4], v[5], f[0]), mix(v[6], v[7], f[0]), f[1]), f[2])


MASSES = [(normalized(c), width, strength) for c, width, strength in [
    ((-.10, .66, .75), 2.9, 1),
    ((.84, -.35, .42), 3.5, 1.05),
    ((-.78, .05, .30), 3.3, .98),
    ((.30, -.38, -.86), 3.0, 1),
    ((-.45, .65, -.62), 3.5, .95),
]]


def surface(n):
    # Broad domain warping supplies coves without the old serrated noise fringe.
    q = normalized([n[k] + .18 * (noise([n[j] * 2.6 + (k * 7.1, 3, 9)[j]
                                       for j in range(3)]) - .5) for k in range(3)])
    shape = sum(strength * math.exp(-sum((q[k] - c[k]) ** 2 for k in range(3)) * width)
                for c, width, strength in MASSES)
    detail = noise([n[k] * 7 + (3, 7, 1)[k] for k in range(3)]) - .5
    fine = noise([n[k] * 17 + (11, 1, 9)[k] for k in range(3)]) - .5
    coast = shape - .36 + detail * .12 + fine * .024
    # Relief is independent of continent centres: no inflated island domes.
    upland = smooth(.24, .76, noise([n[k] * 3.7 + (12, 6, 21)[k] for k in range(3)]))
    ridge = (1 - abs(2 * noise([n[k] * 13 + (8, 3, 1)[k] for k in range(3)]) - 1)) ** 3
    if coast > 0:
        height = .003 * smooth(0, .025, coast)
        height += (.004 + .010 * upland * (.35 + .65 * ridge)) * smooth(.005, .10, coast)
    else:
        height = max(-.065, coast * .16)
    return coast, height, upland


def linear(c):
    return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4


def surface_color(n, coast, height, upland, land):
    if land:
        variation = noise([n[k] * 21 + (5, 19, 2)[k] for k in range(3)])
        dryness = noise([n[k] * 4 + (30, 12, 4)[k] for k in range(3)])
        green = tuple(mix(a, b, variation * .6 + upland * .4)
                      for a, b in zip((.36, .48, .29), (.45, .54, .34)))
        color = tuple(mix(a, b, smooth(.70, .90, dryness) * .28)
                      for a, b in zip(green, (.59, .54, .36)))
        color = tuple(mix(a, b, smooth(.012, .022, height) * .20)
                      for a, b in zip(color, (.62, .60, .48)))
        beach = 1 - smooth(.001, .019, coast)
        color = tuple(mix(a, b, beach) for a, b in zip(color, (.69, .66, .48)))
    else:
        shelf = smooth(-.16, -.005, coast) ** 1.4
        color = tuple(mix(a, b, shelf)
                      for a, b in zip((.06, .26, .40), (.15, .48, .47)))
    return tuple(linear(c) for c in color) + (1,)


def coverage(count=20000):
    golden = math.pi * (3 - math.sqrt(5))
    land = 0
    for i in range(count):
        y = 1 - 2 * (i + .5) / count
        r = math.sqrt(1 - y * y)
        n = (r * math.cos(i * golden), y, r * math.sin(i * golden))
        land += surface(n)[0] > 0
    return land / count
