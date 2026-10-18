import type { NextConfig } from "next";
if (
  process.env.NODE_ENV === "production" &&
  process.env.SPLITCART_DEV_AUTH === "1"
)
  throw new Error("Development identity is forbidden in production");
const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  serverExternalPackages: ["pg"],
};
export default config;
