// Vercel Serverless Function Entrypoint with error diagnostics
let app;
let initError = null;

try {
  app = require('../server.js');
} catch (err) {
  initError = {
    message: err.message,
    stack: err.stack,
    name: err.name
  };
}

module.exports = (req, res) => {
  if (initError) {
    return res.status(500).json({
      error: 'Serverless initialization error',
      details: initError
    });
  }

  try {
    const matchedPath = req.headers['x-matched-path'] || req.headers['x-vercel-matched-path'] || req.headers['x-forwarded-uri'];
    if (matchedPath && (req.url === '/api/index.js' || req.url === '/api/index' || req.url === '/api')) {
      req.url = matchedPath;
    }
    return app(req, res);
  } catch (err) {
    return res.status(500).json({
      error: 'Serverless runtime invocation error',
      message: err.message,
      stack: err.stack
    });
  }
};
