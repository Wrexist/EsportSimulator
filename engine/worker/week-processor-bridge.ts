import { WeekProcessorBridge } from "./week-processor-client"

// Keep the bundler-specific URL at the browser entry point. The client accepts
// a worker factory so its request lifecycle can be tested independently.
export const weekProcessorBridge = new WeekProcessorBridge(() =>
  new Worker(new URL("./week-processor.worker.ts", import.meta.url))
)
