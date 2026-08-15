import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["mammoth", "read-excel-file", "unpdf"],
};

export default nextConfig;
