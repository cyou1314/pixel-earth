"""Split the supplied v0.5 HTML page into the requested dist/ files.

Run from the project checkout:
    python3 scripts/import-standalone.py [path/to/pixel-earth.html]

This imports an existing implementation; it does not implement v0.5 features.
All source and JavaScript checks happen before the current dist/ is changed.
"""
import argparse
import json
import re
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = "0.5.0"


def extract(html):
    styles = list(re.finditer(r"<style\b[^>]*>([\s\S]*?)</style\s*>", html, re.I))
    scripts = list(re.finditer(r"<script\b([^>]*)>([\s\S]*?)</script\s*>", html, re.I))
    inline = [match for match in scripts if not re.search(r"\bsrc\s*=", match[1], re.I)]
    body = re.search(r"<body\b[^>]*>([\s\S]*?)</body\s*>", html, re.I)
    if len(styles) != 1 or len(inline) != 1 or body is None:
        raise ValueError("完整页面必须包含一个 <style>、一个内联 <script> 和完整的 <body>。")
    script = inline[0]
    if not (body.start(1) <= script.start() and script.end() <= body.end(1)):
        raise ValueError("内联脚本需要位于 <body> 中，与提供的打包方式一致。")
    css, js = styles[0][1].strip(), script[2].strip()
    markup = html[body.start(1):script.start()] + html[script.end():body.end(1)]
    if not css or not js or not markup.strip():
        raise ValueError("页面的 CSS、JavaScript 和主体内容都不能为空。")
    return css + "\n", js + "\n", markup.strip()


def prepare(source):
    css, js, body = extract(source.read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory(prefix="pixel-earth-import-") as directory:
        candidate = Path(directory) / "app.mjs"
        candidate.write_text(js, encoding="utf-8")
        result = subprocess.run(["node", "--check", str(candidate)], capture_output=True, text=True)
        if result.returncode:
            raise ValueError("JavaScript 语法检查失败，尚未改动 dist/：\n" + result.stderr.strip())
    engine_preload = '<link rel="modulepreload" href="./engine-v0.5.js">\n' if './engine-v0.5.js' in js else ''
    index = f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#7faec8">
<title>小地球 · Pixel Earth v0.5</title>
<meta name="description" content="一颗拥有像素地形、河流和薄云的可交互小地球。">
<link rel="stylesheet" href="./style.css">
<link rel="modulepreload" href="./app.js">
{engine_preload}\
</head>
<body>
{body}
<script type="module" src="./boot.js"></script>
</body>
</html>
"""
    return {
        "style.css": css,
        "app.js": js,
        "world.js": js,
        "boot.js": "import('./app.js').catch(e => console.error(e));\n",
        "index.html": index,
        "build.json": json.dumps({"version": VERSION, "engine": "WebGL Cube-Sphere Pixel Pipeline"}, indent=2) + "\n",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", nargs="?", type=Path, default=ROOT / "pixel-earth.html")
    parser.add_argument("--check", action="store_true", help="核验生成文件与完整页面一致，不写入文件")
    parser.add_argument("--validate-source", action="store_true", help="只验证原始页面，不写入文件")
    arguments = parser.parse_args()
    source = arguments.source.resolve()
    if not source.is_file():
        parser.exit(1, f"缺少 v0.5 原始页面：{source}\n尚未改动 dist/、版本信息或 Git。\n")
    try:
        outputs = prepare(source)
        ignore_path = ROOT / ".gitignore"
        ignored = ignore_path.read_text(encoding="utf-8")
        metadata = {}
        for filename in ("package.json", "package-lock.json"):
            path = ROOT / filename
            if path.is_file():
                value = json.loads(path.read_text(encoding="utf-8"))
                value["version"] = VERSION
                if filename == "package-lock.json" and "" in value.get("packages", {}):
                    value["packages"][""]["version"] = VERSION
                metadata[path] = json.dumps(value, indent=2, ensure_ascii=False) + "\n"
    except (OSError, ValueError) as error:
        parser.exit(1, str(error) + "\n")
    destination = ROOT / "dist"
    if arguments.validate_source:
        print("v0.5 页面结构与 JavaScript 语法检查通过。")
        return
    if arguments.check:
        mismatched = [f"dist/{name}" for name, content in outputs.items()
                      if not (destination / name).is_file() or (destination / name).read_text(encoding="utf-8") != content]
        mismatched += [path.name for path, content in metadata.items()
                       if path.read_text(encoding="utf-8") != content]
        if "dist/app.js" in {line.strip() for line in ignored.splitlines()}:
            mismatched.append(".gitignore (dist/app.js 仍被忽略)")
        if mismatched:
            parser.exit(1, "导入结果与原始页面不一致，请运行 npm run build：\n" + "\n".join(mismatched) + "\n")
        print("v0.5 静态导入检查通过：JavaScript 语法、六个生成文件、版本信息与 Git 跟踪规则一致。")
        print("此检查不验证 WebGL 画面或摄像头手势，仍需实际浏览器和设备验收。")
        return
    destination.mkdir(parents=True, exist_ok=True)
    canonical_source = ROOT / "pixel-earth.html"
    if source != canonical_source:
        canonical_source.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")
    for name, content in outputs.items():
        (destination / name).write_text(content, encoding="utf-8")
    for path, content in metadata.items():
        path.write_text(content, encoding="utf-8")
    ignore_path.write_text("\n".join(line for line in ignored.splitlines() if line.strip() != "dist/app.js") + "\n", encoding="utf-8")
    print("dist/ 更新完成：v0.5.0。请继续核验实际页面和构建流程后提交、发布。")


if __name__ == "__main__":
    main()
