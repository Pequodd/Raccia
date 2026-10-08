// Extends app.json. EXPO_BASE_URL serves the web build from a sub-path,
// e.g. /Raccia on GitHub Pages (https://<user>.github.io/Raccia/).
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
});
