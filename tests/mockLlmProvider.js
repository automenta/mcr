export const mockLlmProvider = {
  generate: async (prompt) => {
    if (prompt.includes('Convert')) {
      if (prompt.includes('Is Socrates mortal?')) {
        return 'mortal(socrates).';
      } else if (prompt.includes('All men are mortal.')) {
        return 'mortal(X) :- man(X).';
      } else if (prompt.includes('Socrates is a man.')) {
        return 'man(socrates).';
      }
      return '';
    }
    return 'Socrates is mortal because all men are mortal.';
  },
};
