using System.Numerics;
using System.Text.Json;
using ValveResourceFormat;
using ValveResourceFormat.ResourceTypes;
using ValveResourceFormat.Serialization.KeyValues;
if(args.Length < 2 || args.Length > 3 || (args.Length == 3 && args[2] != "--geometry")) throw new ArgumentException("Usage: MapPhysicsImporter input.vmdl_c output.json [--geometry]");
var detailed = args.Length == 3;
using var resource = new Resource();
resource.Read(args[0]);
var physics = (PhysAggregateData)resource.GetBlockByType(BlockType.PHYS)!;
static float[] V(Vector3 p) => [p.X,p.Y,p.Z];
var hulls = new List<object>();
var meshes = new List<object>();
foreach(var part in physics.Parts) {
 foreach(var descriptor in part.Shape.Hulls) {
  var shape=descriptor.Shape;
  hulls.Add(new { collisionAttributeIndex=descriptor.CollisionAttributeIndex, surfacePropertyIndex=descriptor.SurfacePropertyIndex, min=V(shape.Min), max=V(shape.Max), vertices=shape.GetVertexPositions().ToArray().Select(V).ToArray() });
 }
 foreach(var descriptor in part.Shape.Meshes) {
  var shape=descriptor.Shape;
  meshes.Add(new { collisionAttributeIndex=descriptor.CollisionAttributeIndex, min=V(shape.Min), max=V(shape.Max), vertexCount=shape.GetVertices().Length, triangleCount=shape.GetTriangles().Length,
   vertices=detailed ? shape.GetVertices().ToArray().Select(V).ToArray() : null,
   triangles=detailed ? shape.GetTriangles().ToArray().Select(t => new[] { t.X, t.Y, t.Z }).ToArray() : null });
 }
}
File.WriteAllText(args[1],JsonSerializer.Serialize(new { format="esim-native-physics-inspection",version=1,collisionAttributes=physics.CollisionAttributes.Select(a => new { interactAs=a.GetArray<string>("m_InteractAsStrings") ?? a.GetArray<string>("m_PhysicsTagStrings") ?? [], interactExclude=a.GetArray<string>("m_InteractExcludeStrings") ?? [], group=a.GetStringProperty("m_CollisionGroupString") }).ToArray(),hulls,meshes }, new JsonSerializerOptions { WriteIndented=true, DefaultIgnoreCondition=System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull }));
Console.WriteLine($"Exported {hulls.Count} hulls and {meshes.Count} mesh records.");
