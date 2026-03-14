const express = require('express');
const path = require('path');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Build the web app if dist doesn't exist or in production
const distPath = path.join(__dirname, 'dist');

console.log('Starting QR-Kassan web server...');

// Check if we need to build
const fs = require('fs');
if (!fs.existsSync(distPath) || process.env.FORCE_BUILD === 'true') {
  console.log('Building web app...');
  try {
    execSync('npx expo export --platform web', { 
      stdio: 'inherit',
      cwd: __dirname,
      env: { ...process.env, NODE_ENV: 'production' }
    });
    console.log('Build complete!');
  } catch (error) {
    console.error('Build failed:', error.message);
    process.exit(1);
  }
}

// Serve static files from dist directory
app.use(express.static(distPath));

// Handle client-side routing - serve index.html for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`QR-Kassan running on port ${PORT}`);
});
