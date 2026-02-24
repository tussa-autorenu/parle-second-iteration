import { buildApp } from "./app.js";
import { config } from "./config/env.js";

const app = await buildApp();
await app.listen({ port: config.port, host: "0.0.0.0" });

export default app;
