import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    output: "standalone",
    transpilePackages: ["jsondiffpatch"],
};

export default nextConfig;
