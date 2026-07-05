import path from "node:path";

import { defineConfig } from "vite";

const rootDir = import.meta.dirname;

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: "../public/app",
    rollupOptions: {
      input: {
        admin: path.resolve(rootDir, "client/admin.ts"),
        editor: path.resolve(rootDir, "client/editor.ts"),
        guestbook: path.resolve(rootDir, "client/guestbook.ts"),
        styles: path.resolve(rootDir, "client/styles.css"),
      },
      output: {
        assetFileNames: "[name][extname]",
        entryFileNames: "[name].js",
      },
    },
  },
  root: "client",
});
