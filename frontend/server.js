const express = require('express');
const path = require('path');
const fs = require('fs');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Backend URL - MUST be set in environment for production
// Example: BACKEND_URL=https://your-new-backend.railway.app or your-server.com
const BACKEND_URL = process.env.BACKEND_URL;

const distPath = path.join(__dirname, 'dist');

console.log('Starting QR-Kassan web server...');
console.log('Backend URL:', BACKEND_URL || 'NOT SET - API calls will fail!');

// Check if dist folder exists (should be built by Railway's build step)
if (!fs.existsSync(distPath) || !fs.existsSync(path.join(distPath, 'index.html'))) {
  console.error('ERROR: dist folder not found. Run "npm run build" first.');
  console.log('Attempting to build now...');
  const { execSync } = require('child_process');
  try {
    execSync('npx expo export --platform web', { 
      stdio: 'inherit',
      cwd: __dirname,
      env: { ...process.env, NODE_ENV: 'production' }
    });
  } catch (error) {
    console.error('Build failed:', error.message);
    process.exit(1);
  }
}

// Proxy API requests to backend (only if BACKEND_URL is configured)
if (BACKEND_URL) {
  app.use('/api', createProxyMiddleware({
    target: BACKEND_URL,
    changeOrigin: true,
    logLevel: 'warn',
    onError: (err, req, res) => {
      console.error('Proxy error:', err.message);
      res.status(502).json({ detail: 'Backend unavailable' });
    }
  }));
} else {
  // Return error for API calls if no backend configured
  app.use('/api', (req, res) => {
    res.status(503).json({ 
      detail: 'Backend not configured. Set BACKEND_URL environment variable.' 
    });
  });
}

// Serve static files from dist directory
app.use(express.static(distPath, {
  maxAge: '1d',  // Cache static assets for 1 day
  etag: true
}));

// Handle client-side routing - serve index.html for all routes
app.use((req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`QR-Kassan running on port ${PORT}`);
});
