const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)
const baseGetTransformOptions = config.transformer?.getTransformOptions

config.transformer = {
  ...config.transformer,
  async getTransformOptions(...args) {
    const baseOptions = baseGetTransformOptions
      ? await baseGetTransformOptions(...args)
      : { transform: {} }

    return {
      ...baseOptions,
      transform: {
        ...baseOptions.transform,
        inlineRequires: true,
      },
    }
  },
}

module.exports = config
