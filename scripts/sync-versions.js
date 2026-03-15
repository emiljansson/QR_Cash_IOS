#!/usr/bin/env node
/**
 * Version Synchronization Script for QR-Kassan and QR-Display
 * 
 * This script ensures both apps share the same PATCH number
 * while maintaining separate MAJOR versions:
 *   - Frontend/Kassa: 2.0.x
 *   - Display-app: 1.0.x
 * 
 * Usage:
 *   node scripts/sync-versions.js           # Sync patch numbers between apps
 *   node scripts/sync-versions.js --bump    # Increment patch version for BOTH apps
 */

const fs = require('fs');
const path = require('path');

const FILES = {
  frontendPackage: path.join(__dirname, '../frontend/package.json'),
  frontendApp: path.join(__dirname, '../frontend/app.json'),
  displayPackage: path.join(__dirname, '../display-app/package.json'),
  displayApp: path.join(__dirname, '../display-app/app.json'),
};

function readJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e.message);
    return null;
  }
}

function writeJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
    return true;
  } catch (e) {
    console.error(`Error writing ${filePath}:`, e.message);
    return false;
  }
}

function parseVersion(version) {
  const parts = version.split('.').map(Number);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0
  };
}

function main() {
  const args = process.argv.slice(2);
  const shouldBump = args.includes('--bump');
  
  console.log('📦 Version Sync Script');
  console.log('======================');
  console.log('Frontend (2.0.x) and Display-app (1.0.x) share the same PATCH number');
  
  // Read current versions
  const frontendPkg = readJson(FILES.frontendPackage);
  const frontendApp = readJson(FILES.frontendApp);
  const displayPkg = readJson(FILES.displayPackage);
  const displayApp = readJson(FILES.displayApp);
  
  if (!frontendPkg || !displayPkg) {
    console.error('Could not read package.json files');
    process.exit(1);
  }
  
  // Get current patch numbers
  const frontendVersion = parseVersion(frontendPkg.version);
  const displayVersion = parseVersion(displayPkg.version);
  
  // Use the highest patch number
  let targetPatch = Math.max(frontendVersion.patch, displayVersion.patch);
  
  // Bump if requested
  if (shouldBump) {
    targetPatch += 1;
  }
  
  // Target versions (keep major.minor, sync patch)
  const frontendTarget = `2.0.${targetPatch}`;
  const displayTarget = `1.0.${targetPatch}`;
  
  console.log(`\n📦 Frontend (QR-Kassan)`);
  console.log(`   Current: ${frontendPkg.version}`);
  
  // Update frontend
  frontendPkg.version = frontendTarget;
  writeJson(FILES.frontendPackage, frontendPkg);
  if (frontendApp?.expo) {
    frontendApp.expo.version = frontendTarget;
    writeJson(FILES.frontendApp, frontendApp);
  }
  console.log(`   Updated: ${frontendTarget}`);
  
  console.log(`\n📦 Display-app (QR-Display)`);
  console.log(`   Current: ${displayPkg.version}`);
  
  // Update display-app
  displayPkg.version = displayTarget;
  writeJson(FILES.displayPackage, displayPkg);
  if (displayApp?.expo) {
    displayApp.expo.version = displayTarget;
    writeJson(FILES.displayApp, displayApp);
  }
  console.log(`   Updated: ${displayTarget}`);
  
  console.log('\n✅ Done!');
}

main();
