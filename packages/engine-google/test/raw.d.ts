/** Vite/Vitest load `?raw` imports as the file text. */
declare module '*?raw' {
  const text: string;
  export default text;
}
