import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { defineConfig } from "vite";

// Canonical media stays outside the frontend build output.
const mediaRoot = path.resolve("media-library");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".webp": "image/webp",
};

/*
 * Serve media-library/* from /media/* during local development and
 * `vite preview`, without copying the library into dist/.
 */
function mediaLibraryPlugin() {
  async function serveMedia(request, response, next) {
    const requestUrl = request.url;

    if (!requestUrl) {
      next();
      return;
    }

    const pathname = decodeURIComponent(
      new URL(requestUrl, "http://localhost").pathname,
    );

    if (!pathname.startsWith("/media/")) {
      next();
      return;
    }

    const relativePath = pathname.slice("/media/".length);
    const filePath = path.resolve(mediaRoot, relativePath);

    // Prevent URLs from escaping the configured media root.
    if (
      filePath !== mediaRoot &&
      !filePath.startsWith(`${mediaRoot}${path.sep}`)
    ) {
      response.statusCode = 403;
      response.end("Forbidden");
      return;
    }

    try {
      const fileStats = await stat(filePath);

      if (!fileStats.isFile()) {
        next();
        return;
      }

      const extension = path.extname(filePath).toLowerCase();

      response.statusCode = 200;
      response.setHeader(
        "Content-Type",
        mimeTypes[extension] ?? "application/octet-stream",
      );
      response.setHeader("Content-Length", fileStats.size);
      response.setHeader("Accept-Ranges", "bytes");

      if (request.method === "HEAD") {
        response.end();
        return;
      }

      createReadStream(filePath).pipe(response);
    } catch {
      next();
    }
  }

  return {
    name: "media-library-server",

    configureServer(server) {
      server.middlewares.use(serveMedia);
    },

    configurePreviewServer(server) {
      server.middlewares.use(serveMedia);
    },
  };
}

export default defineConfig({
  // Do not copy any media directory into dist/.
  publicDir: false,

  plugins: [
    mediaLibraryPlugin(),
  ],
});
