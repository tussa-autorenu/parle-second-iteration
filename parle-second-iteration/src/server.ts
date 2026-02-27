import { buildApp } from "./app.js";
import { config } from "./config/env.js";

const app = await buildApp();

try {
  await app.listen({
    port: config.port,
    host: "0.0.0.0",
  });

  app.log.info(`Server listening on 0.0.0.0:${config.port}`);
} catch (err) {
  app.log.error(err, "Failed to start server");
  process.exit(1);
}

export default app;
