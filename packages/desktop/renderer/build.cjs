const fs = require("node:fs");
const path = require("node:path");
const postcss = require("postcss");
const tailwind = require("@tailwindcss/postcss");
const webpack = require("webpack");
const config = require("./webpack.config.cjs");

const rendererRoot = __dirname;
const outputRoot = path.join(rendererRoot, "..", "dist", "renderer");

async function main() {
  fs.mkdirSync(outputRoot, { recursive: true });
  await buildJavaScript();
  await buildStyles();
  const html = fs
    .readFileSync(path.join(rendererRoot, "index.html"), "utf8")
    .replace(/<script[^>]+src="\.\/index\.js"[^>]*><\/script>/, "<script defer src=\"./index.js\"></script>");
  fs.writeFileSync(path.join(outputRoot, "index.html"), html);
  console.log(`[desktop-renderer] built ${outputRoot}`);
}

function buildJavaScript() {
  return new Promise((resolve, reject) => {
    const compiler = webpack(config);
    compiler.run((error, stats) => {
      compiler.close(() => undefined);
      if (error) {
        reject(error);
        return;
      }
      if (stats?.hasErrors()) {
        reject(new Error(stats.toString({ all: false, errors: true })));
        return;
      }
      resolve();
    });
  });
}

async function buildStyles() {
  const sourcePath = path.join(rendererRoot, "styles.css");
  const source = fs.readFileSync(sourcePath, "utf8");
  const result = await postcss([tailwind()]).process(source, {
    from: sourcePath,
    to: path.join(outputRoot, "styles.css"),
  });
  fs.writeFileSync(path.join(outputRoot, "styles.css"), result.css);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
