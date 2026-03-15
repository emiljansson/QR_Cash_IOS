const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const distPath = path.join(__dirname, 'dist');

console.log('Starting QR-Kassan web server...');

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
