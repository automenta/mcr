async function getYargs() {
  const yargs = await import('yargs/yargs');
  const { hideBin } = await import('yargs/helpers');
  return { yargs, hideBin };
}

module.exports = getYargs;
