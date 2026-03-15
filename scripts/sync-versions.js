#!/usr/bin/env node
/**
 * Version Synchronization Script for QR-Kassan and QR-Display
 * 
 * This script ensures both apps have synchronized version numbers.
 * Run manually or as a git pre-commit hook.
 * 
 * Usage:
 *   node scripts/sync-versions.js           # Sync versions
 *   node scripts/sync-versions.js --bump    # Increment patch version and sync
 */

const fs = require('fs');
const path = require('path');

const FRONTEND_PACKAGE = path.join(__dirname, '../frontend/package.json');
const DISPLAY_PACKAGE = path.join(__dirname, '../display-app/package.json');

function readPackageJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e.message);
    process.exit(1);
  }
}

function writePackageJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
  } catch (e) {
    console.error(`Error writing ${filePath}:`, e.message);
    process.exit(1);
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

function formatVersion(v) {
  return `${v.major}.${v.minor}.${v.patch}`;
}

function bumpPatch(version) {
  const v = parseVersion(version);
  v.patch += 1;
  return formatVersion(v);
}

function getHigherVersion(v1, v2) {
  const p1 = parseVersion(v1);
  const p2 = parseVersion(v2);
  
  if (p1.major !== p2.major) return p1.major > p2.major ? v1 : v2;
  if (p1.minor !== p2.minor) return p1.minor > p2.minor ? v1 : v2;
  if (p1.patch !== p2.patch) return p1.patch > p2.patch ? v1 : v2;
  return v1;
}

function main() {
  const shouldBump = process.argv.includes('--bump');
  
  console.log('📦 Version Sync Script');
  console.log('======================\n');
  
  // Read current versions
  const frontendPkg = readPackageJson(FRONTEND_PACKAGE);
  const displayPkg = readPackageJson(DISPLAY_PACKAGE);
  
  console.log(`QR-Kassan (frontend):  ${frontendPkg.version}`);
  console.log(`QR-Display:            ${displayPkg.version}`);
  
  // Get the higher version
  let targetVersion = getHigherVersion(frontendPkg.version, displayPkg.version);
  
  // Bump if requested
  if (shouldBump) {
    targetVersion = bumpPatch(targetVersion);
    console.log(`\n🔼 Bumping to: ${targetVersion}`);
  }
  
  // Check if sync is needed
  const needsSync = frontendPkg.version !== targetVersion || displayPkg.version !== targetVersion;
  
  if (!needsSync && !shouldBump) {
    console.log('\n✅ Versions are already synchronized!');
    return;
  }
  
  // Update versions
  frontendPkg.version = targetVersion;
  displayPkg.version = targetVersion;
  
  writePackageJson(FRONTEND_PACKAGE, frontendPkg);
  writePackageJson(DISPLAY_PACKAGE, displayPkg);
  
  console.log(`\n✅ Both apps now at version ${targetVersion}`);
  console.log('\nUpdated files:');
  console.log('  - frontend/package.json');
  console.log('  - display-app/package.json');
}

main();
