// app.config.js
// Expose GOLF_COURSE_API_KEY via expo.extra for golfCourseApi.
// Load .env so process.env.GOLF_COURSE_API_KEY is available at config time.
// EAS: set as secret; locally: use .env.
require('dotenv').config();

const { expo } = require('./app.json');

module.exports = ({ config }) => ({
  ...config,
  ...expo,
  android: {
    ...(expo.android || {}),
    package: 'com.thetoweruk.netpargolf',
  },
  extra: {
    ...(config.extra || {}),
    ...(expo.extra || {}),
    golfCourseApiKey: process.env.GOLF_COURSE_API_KEY ?? '',
    eas: {
      ...(expo.extra?.eas || {}),
      projectId: '6bd586fc-83e4-4edf-8812-cfac752b1494',
    },
  },
});
