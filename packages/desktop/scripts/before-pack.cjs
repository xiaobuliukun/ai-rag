const { prepareRuntime } = require("./prepare-runtime.cjs");

const ARCH_NAMES = {
  0: "ia32",
  1: "x64",
  2: "armv7l",
  3: "arm64",
  4: "universal",
};

module.exports = async function beforePack(context, prepare = prepareRuntime) {
  const arch = ARCH_NAMES[context.arch];

  if (!arch || arch === "universal") {
    throw new Error(`Unsupported desktop runtime architecture: ${context.arch}`);
  }

  await prepare({
    electronVersion: context.packager.info.framework.version,
    platform: context.electronPlatformName,
    arch,
  });
};
