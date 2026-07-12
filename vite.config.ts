import { defineConfig } from "vite";

/*
 * Serve the canonical project media library directly.
 *
 * Files under assets/ become available from the site root:
 * assets/releases/... -> /releases/...
 */
export default defineConfig({
  publicDir: "assets",
});
