/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Enables src/instrumentation.ts (warms DB schema check at server start).
    instrumentationHook: true,
    serverComponentsExternalPackages: ['pg', 'tesseract.js', 'exceljs', 'xlsx', '@aws-sdk/client-s3', 'jszip', 'html2canvas', 'jspdf'],
  },
};

module.exports = nextConfig;
