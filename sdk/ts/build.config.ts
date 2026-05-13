import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  clean: true,
  declaration: true,
  entries: [
    {
      builder: "mkdist",
      input: "./src/",
      outDir: "./dist",
      ext: "js",
      format: "esm",
      pattern: ["**", "!**/*.test.ts"],
    },
  ],
});
