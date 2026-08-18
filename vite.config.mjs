import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/*
 * Resolve the sanitized public package outside the frontend repository.
 *
 * Default: ../published-media
 * Override: PUBLISHED_MEDIA_ROOT=/path/to/alternate-public-package
 *
 * The canonical private Library and ingest roots are deliberately rejected.
 */
const projectRoot = path.dirname(
  fileURLToPath(import.meta.url),
);
const configuredPublishedMediaRoot =
  process.env.PUBLISHED_MEDIA_ROOT ?? "../published-media";
const publishedMediaRoot = path.resolve(
  projectRoot,
  configuredPublishedMediaRoot,
);

const canonicalPrivateRoots = [
  path.resolve(projectRoot, "../media-library"),
  path.resolve(projectRoot, "../ingest-drop"),
];

function pathIsInside(root, candidate) {
  return (
    candidate === root ||
    candidate.startsWith(`${root}${path.sep}`)
  );
}

for (const privateRoot of canonicalPrivateRoots) {
  if (pathIsInside(privateRoot, publishedMediaRoot)) {
    throw new Error(
      "Hiplingo public media root must not point at media-library or " +
        "ingest-drop. Use metadata-editor published-media output instead.",
    );
  }
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".m3u8": "application/vnd.apple.mpegurl",
  ".m4s": "video/iso.segment",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".webp": "image/webp",
};

/*
 * Serve the configured media root from /media/* during development and
 * `vite preview`, without copying the public package into dist/.
 */
function publishedMediaPlugin() {
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
    const filePath = path.resolve(publishedMediaRoot, relativePath);

    // Prevent URLs from escaping the configured media root.
    if (
      filePath !== publishedMediaRoot &&
      !filePath.startsWith(`${publishedMediaRoot}${path.sep}`)
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
    name: "published-media-server",

    configureServer(server) {
      server.middlewares.use(serveMedia);
    },

    configurePreviewServer(server) {
      server.middlewares.use(serveMedia);
    },
  };
}

export default defineConfig({
  /*
   * The linked @hiplingo/media-player workspace can resolve React from the
   * sibling packages/node_modules tree. Force the application and all linked
   * packages to share Hiplingo's React runtime so production builds do not
   * bundle a second React instance.
   */
  resolve: {
    dedupe: ["react", "react-dom"],
  },

  server: {
    host: "127.0.0.1",
    port: 5173,
  },

  build: {
    // hls.js is lazy-loaded into its own chunk and is not part of the
    // initial Hiplingo payload. Keep this threshold narrowly above the
    // current HLS engine size so unrelated bundle growth still warns.
    chunkSizeWarningLimit: 525,
  },

  // Static Hiplingo site/brand assets live under public/ and are copied into
  // dist/ by Vite. Published release media remains outside this repository
  // and is served separately from ../published-media at /media/*.
  publicDir: "public",

  plugins: [
    publishedMediaPlugin(),
  ],
});
