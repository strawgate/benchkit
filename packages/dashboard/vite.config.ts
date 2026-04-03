import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  base: "/benchkit/",
  build: {
    commonjsOptions: {
      include: [/format/, /node_modules/],
    },
  },
});
