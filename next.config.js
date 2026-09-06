/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['pg', 'tesseract.js', 'exceljs', 'xlsx', '@aws-sdk/client-s3', 'jszip', 'html2canvas', 'jspdf'],
  },
};

module.exports = nextConfig;
