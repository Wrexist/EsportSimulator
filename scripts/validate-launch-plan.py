"""Check the launch backlog's references, dependency graph and coverage without changing status."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "docs/launch-readiness"
document = json.loads((BASE / "backlog.json").read_text(encoding="utf-8"))
packages = document["packages"]
by_id = {p["id"]: p for p in packages}
assert len(by_id) == len(packages), "Duplicate package ID"
assert len(packages) == 36, "Update the documented package count deliberately"
legacy = set()
task_ids = set()
for package in packages:
    pid = package["id"]
    assert re.fullmatch(r"L\d{2}", pid), pid
    assert package["status"] in {"open", "partial", "unverified", "failed", "verified", "excluded"}, pid
    assert package["gate"] in {"required", "conditional"}, pid
    for dependency in package["dependsOn"]:
        assert dependency in by_id and dependency != pid, (pid, dependency)
    for entry in package["entryPoints"]:
        assert (ROOT / entry).exists(), (pid, "missing entry point", entry)
    prompt = (BASE / package["prompt"]).read_text(encoding="utf-8")
    assert f"SELECTED PACKAGE: {pid}" in prompt, pid
    for entry in package["tasks"] + package["acceptance"]:
        assert entry["id"] not in task_ids, entry["id"]
        task_ids.add(entry["id"])
        assert isinstance(entry["done"], bool), entry["id"]
        assert entry["text"] in prompt, (pid, "prompt does not match backlog")
    if package["status"] == "verified":
        assert package["evidence"] and all(t["done"] for t in package["tasks"] + package["acceptance"]), pid
    if package["status"] == "excluded":
        assert package["gate"] == "conditional" and package["evidence"], pid
    legacy.update(package["legacyPackages"])

assert legacy == set(range(1, 61)), "Earlier audit packages are missing or invalid"
visited, active, order = set(), set(), []


def visit(pid):
    assert pid not in active, ("Dependency cycle", pid)
    if pid in visited:
        return
    active.add(pid)
    for dependency in by_id[pid]["dependsOn"]:
        visit(dependency)
    active.remove(pid)
    visited.add(pid)
    order.append(pid)


for pid in by_id:
    visit(pid)

routes = set()
for path in (ROOT / "app").rglob("page.tsx"):
    suffix = path.parent.relative_to(ROOT / "app").as_posix()
    routes.add("/" if suffix == "." else "/" + suffix)
matrix = (BASE / "ROUTE-MATRIX.md").read_text(encoding="utf-8")
listed = set(re.findall(r"^\| `([^`]+)` \|", matrix, re.MULTILINE))
assert listed == routes, {"missing": sorted(routes - listed), "stale": sorted(listed - routes)}

for path in BASE.rglob("*.md"):
    for target in re.findall(r"\]\(([^)]+)\)", path.read_text(encoding="utf-8")):
        if "://" in target or target.startswith("#"):
            continue
        assert (path.parent / target.split("#")[0]).exists(), (path, target)

report = {
    "packages": len(packages),
    "tasks": sum(len(p["tasks"]) for p in packages),
    "acceptanceCriteria": sum(len(p["acceptance"]) for p in packages),
    "legacyPackagesCovered": len(legacy),
    "routesCovered": len(routes),
    "validDependencyOrder": order,
    "result": "PASS: document structure and references; not implementation acceptance",
}
(BASE / "evidence/plan-validation.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, indent=2))
