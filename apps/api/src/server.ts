import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { loadConfig } from "./config.js";

export function buildServer() {
  const app = Fastify({
    logger: true
  });

  app.register(cors, {
    origin: true
  });
  app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024
    }
  });

  app.get("/health", async () => ({
    ok: true,
    service: "knowledge-amazon-api"
  }));

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const app = buildServer();
  await app.listen({
    port: config.port,
    host: "0.0.0.0"
  });
}
