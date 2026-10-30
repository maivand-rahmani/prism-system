/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    // @prism-system:transpile:begin
    "@prism-system/ui-core",
    "@prism-system/ui-system-a",
    "@prism-system/ui-system-b",
    "@prism-system/ui-system-plr",
    // @prism-system:transpile:end
  ],
};

export default nextConfig;
