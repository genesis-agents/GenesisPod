/**
 * Mock implementation of marked for Jest tests
 *
 * marked is an ESM module that causes issues with Jest.
 * This mock provides a simple implementation that works in tests.
 */

function marked(markdown) {
  // Simple mock: just return the markdown as-is wrapped in a paragraph
  return `<p>${markdown}</p>`;
}

// Mock the parse method
marked.parse = function (markdown) {
  return `<p>${markdown}</p>`;
};

// Mock other commonly used methods
marked.parseInline = function (markdown) {
  return markdown;
};

marked.setOptions = function (options) {
  return marked;
};

marked.use = function (extension) {
  return marked;
};

module.exports = { marked };
module.exports.marked = marked;
module.exports.default = marked;
