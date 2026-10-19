/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  // E2E tests run their own dev server; a separate output dir keeps it from
  // clobbering the one used for day-to-day development.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};
