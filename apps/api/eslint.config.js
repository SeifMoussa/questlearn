const shared = require("@questlearn/config/eslint");

module.exports = [
  ...shared,
  {
    languageOptions: {
      parserOptions: {
        sourceType: "module",
      },
    },
  },
];
