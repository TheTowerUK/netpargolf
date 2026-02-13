// app.config.js
// Expose GOLFCOURSE_API_KEY via expo.extra so the app can pass it to golfCourseApi.
// Load .env so process.env.GOLFCOURSE_API_KEY is available at build/config time.
// EAS: set as secret; locally: use .env or EXPO_PUBLIC_GOLFCOURSE_API_KEY.
require('dotenv').config();

const appJson = require('./app.json');

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...appJson.expo?.extra,
      golfCourseApiKey:
        process.env.GOLFCOURSE_API_KEY ??
        process.env.EXPO_PUBLIC_GOLFCOURSE_API_KEY ??
        '',
    },
  },
};
