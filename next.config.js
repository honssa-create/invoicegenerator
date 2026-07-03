/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'tesseract.js', 'exceljs'],
  },
};

module.exports = nextConfig;
