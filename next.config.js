/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Toujours défini au build : la condition « mode démo » devient une
  // constante et le code de démo est retiré du paquet de production.
  env: { NEXT_PUBLIC_DEMO: process.env.NEXT_PUBLIC_DEMO === '1' ? '1' : '0' },
}
module.exports = nextConfig
