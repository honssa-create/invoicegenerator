/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'tesseract.js', 'exceljs', 'xlsx', '@aws-sdk/client-s3', 'jszip'],
  },
};

module.exports = nextConfig;
