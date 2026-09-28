// Vercel Serverless Function Entrypoint
const app = require('../server.js');

module.exports = (req, res) => {
  // If Vercel internal rewrites passed /api/index.js or /api/index, restore original URL
  const matchedPath = req.headers['x-matched-path'] || req.headers['x-vercel-matched-path'] || req.headers['x-forwarded-uri'];
  if (matchedPath && (req.url === '/api/index.js' || req.url === '/api/index' || req.url === '/api')) {
    req.url = matchedPath;
  }
  return app(req, res);
};
