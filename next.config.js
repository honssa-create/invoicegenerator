/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'tesseract.js', 'exceljs', 'xlsx'],
  },
};

module.exports = nextConfig;
