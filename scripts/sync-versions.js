#!/usr/bin/env node
/**
 * Version Synchronization Script for QR-Kassan and QR-Display
 * 
 * This script ensures both apps have synchronized version numbers
 * in both package.json and app.json files.
 * 
 * Usage:
 *   node scripts/sync-versions.js           # Sync versions
 *   node scripts/sync-versions.js --bump    # Increment patch version and sync
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

function formatVersion(v) {
  return `${v.major}.${v.minor}.${v.patch}`;
}

function bumpPatch(version) {
  const v = parseVersion(version);
  v.patch += 1;
  return formatVersion(v);
}

function compareVersions(v1, v2) {
  const p1 = parseVersion(v1);
  const p2 = parseVersion(v2);
  
  if (p1.major !== p2.major) return p1.major > p2.major ? 1 : -1;
  if (p1.minor !== p2.minor) return p1.minor > p2.minor ? 1 : -1;
  if (p1.patch !== p2.patch) return p1.patch > p2.patch ? 1 : -1;
  return 0;
}

function main() {
  const shouldBump = process.argv.includes('--bump');
  
  console.log('📦 Version Sync Script');
  console.log('======================\n');
  
  // Read all files
  const frontendPkg = readJson(FILES.frontendPackage);
  const frontendApp = readJson(FILES.frontendApp);
  const displayPkg = readJson(FILES.displayPackage);
  const displayApp = readJson(FILES.displayApp);
  
  if (!frontendPkg || !displayPkg) {
    console.error('Could not read required package.json files');
    process.exit(1);
  }
  
  // Collect all versions
  const versions = [
    { name: 'frontend/package.json', version: frontendPkg.version },
    { name: 'frontend/app.json', version: frontendApp?.expo?.version || '0.0.0' },
    { name: 'display-app/package.json', version: displayPkg.version },
    { name: 'display-app/app.json', version: displayApp?.expo?.version || '0.0.0' },
  ];
  
  console.log('Current versions:');
  versions.forEach(v => console.log(`  ${v.name}: ${v.version}`));
  
  // Find highest version
  let targetVersion = versions.reduce((highest, current) => {
    return compareVersions(current.version, highest) > 0 ? current.version : highest;
  }, '0.0.0');
  
  // Bump if requested
  if (shouldBump) {
    targetVersion = bumpPatch(targetVersion);
    console.log(`\n🔼 Bumping to: ${targetVersion}`);
  }
  
  // Check if sync is needed
  const needsSync = versions.some(v => v.version !== targetVersion);
  
  if (!needsSync && !shouldBump) {
    console.log('\n✅ All versions are already synchronized!');
    return;
  }
  
  // Update all files
  console.log(`\nSyncing all to version: ${targetVersion}\n`);
  
  const updated = [];
  
  // Update package.json files
  frontendPkg.version = targetVersion;
  if (writeJson(FILES.frontendPackage, frontendPkg)) {
    updated.push('frontend/package.json');
  }
  
  displayPkg.version = targetVersion;
  if (writeJson(FILES.displayPackage, displayPkg)) {
    updated.push('display-app/package.json');
  }
  
  // Update app.json files
  if (frontendApp?.expo) {
    frontendApp.expo.version = targetVersion;
    if (writeJson(FILES.frontendApp, frontendApp)) {
      updated.push('frontend/app.json');
    }
  }
  
  if (displayApp?.expo) {
    displayApp.expo.version = targetVersion;
    if (writeJson(FILES.displayApp, displayApp)) {
      updated.push('display-app/app.json');
    }
  }
  
  console.log('✅ Updated files:');
  updated.forEach(f => console.log(`  - ${f}`));
  console.log(`\nAll apps now at version ${targetVersion}`);
}

main();
