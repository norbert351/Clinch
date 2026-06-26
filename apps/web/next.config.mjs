/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,

  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    unoptimized: true,
  },

  serverExternalPackages: [
    'lightningcss',
    'lightningcss-win32-x64-msvc',
    'lightningcss-darwin-x64',
    'lightningcss-linux-x64-gnu',
  ],

  webpack: (config, { isServer }) => {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      /@react-native-async-storage/,
      /pino-pretty/,
      /Critical dependency/,
      /the request of a dependency is an expression/,
      /lightningcss/,
      /@tailwindcss\/oxide/,
    ];

    if (!isServer) {
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        fs: false,
        path: false,
        os: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        http: false,
        https: false,
        zlib: false,
      };
    }

    return config;
  },
};

export default nextConfig;
