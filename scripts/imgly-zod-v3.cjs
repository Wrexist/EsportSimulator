// @imgly/background-removal-node still calls the zod 3 API (z.function().args).
// The project installs only zod 4 (no zod 3 release is free of GHSA-mrhx-c7xc-m3w5),
// and zod 4 ships the old API under "zod/v3", so hand that to imgly alone.
const Module = require("module")
const resolve = Module._resolveFilename
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === "zod" && parent && /[\\/]@imgly[\\/]background-removal-node[\\/]/.test(parent.filename || "")) {
    return resolve.call(this, "zod/v3", parent, ...rest)
  }
  return resolve.call(this, request, parent, ...rest)
}
