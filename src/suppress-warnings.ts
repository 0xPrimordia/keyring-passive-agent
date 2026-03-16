// Suppress specific Node.js warnings
const originalEmitWarning = process.emitWarning;

process.emitWarning = function (warning: string | Error, ...args: unknown[]) {
  if (typeof warning === 'string' && warning.includes('--experimental-loader')) {
    return;
  }
  if (
    typeof warning === 'string' &&
    (warning.includes('punycode') || warning.includes('DEP0040'))
  ) {
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (originalEmitWarning as any).call(process, warning, ...args);
};
