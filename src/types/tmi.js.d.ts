declare module 'tmi.js' {
  // Minimal ambient module so TypeScript accepts the dependency.
  // Runtime types are covered by //@ts-nocheck in twitch-chat-worker.ts.
  const tmi: unknown;
  export default tmi;
}
