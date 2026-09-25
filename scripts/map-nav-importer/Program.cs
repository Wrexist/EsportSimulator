using System.Text.Json;
using ValveResourceFormat.NavMesh;

if (args.Length != 2) throw new ArgumentException("Usage: MapNavImporter input.nav output.json");
var nav = new NavMeshFile();
nav.Read(args[0]);
var areas = nav.Areas.Values.Select(a => new {
    id = a.AreaId, hull = a.HullIndex, flags = ((long)a.AttributeFlags).ToString(), movable = a.MovableMeshId,
    corners = a.Corners.Select(p => new[] { p.X, p.Y, p.Z }),
    edges = a.Connections.SelectMany((links, edge) => links.Select(c => new { target = c.AreaId, edge, targetEdge = c.EdgeId })),
    laddersAbove = a.LaddersAbove, laddersBelow = a.LaddersBelow
});
var ladders = nav.Ladders.Select(l => new {
    id = l.Id, width = l.Width, top = new[] { l.Top.X, l.Top.Y, l.Top.Z }, bottom = new[] { l.Bottom.X, l.Bottom.Y, l.Bottom.Z },
    topAreas = new[] { l.TopForwardArea?.AreaId, l.TopLeftArea?.AreaId, l.TopRightArea?.AreaId, l.TopBehindArea?.AreaId }.Where(x => x.HasValue).Select(x => x!.Value),
    bottomAreas = new[] { l.BottomArea?.AreaId, l.BottomLeftArea?.AreaId, l.BottomRightArea?.AreaId }.Where(x => x.HasValue).Select(x => x!.Value)
});
File.WriteAllText(args[1], JsonSerializer.Serialize(new { version = nav.Version, areas, ladders }));
