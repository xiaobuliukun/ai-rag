const path = require("node:path");

const rendererRoot = __dirname;
const projectRoot = path.resolve(rendererRoot, "../..");
const webRoot = path.join(projectRoot, "web");
const sharedSource = path.join(projectRoot, "shared", "src", "index.ts");

module.exports = {
  mode: "production",
  target: "web",
  context: rendererRoot,
  entry: "./src/main.tsx",
  output: {
    path: path.join(rendererRoot, "..", "dist", "renderer"),
    filename: "index.js",
    clean: true,
  },
  resolve: {
    extensions: [".tsx", ".ts", ".jsx", ".js"],
    alias: {
      "@": webRoot,
      "@moxu/shared": sharedSource,
      "next/link": path.join(rendererRoot, "src/compat/next-link.tsx"),
      "next/navigation": path.join(
        rendererRoot,
        "src/compat/next-navigation.ts",
      ),
      "next/image": path.join(rendererRoot, "src/compat/next-image.tsx"),
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: require.resolve("ts-loader"),
          options: {
            transpileOnly: true,
            configFile: path.join(rendererRoot, "tsconfig.json"),
          },
        },
      },
    ],
  },
  optimization: {
    minimize: true,
  },
};
