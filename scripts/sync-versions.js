#!/usr/bin/env node
/**
 * Version Synchronization Script for QR-Kassan and QR-Display
 * 
 * This script ensures each app has synchronized version numbers
 * between its package.json and app.json files.
 * 
 * NOTE: Frontend (Kassa) and Display-app have SEPARATE version tracks:
 *   - Frontend/Kassa: 2.x.x
 *   - Display-app: 1.x.x
 * 
 * Usage:
 *   node scripts/sync-versions.js                    # Sync versions within each app
 *   node scripts/sync-versions.js --bump             # Increment patch version for frontend only
 *   node scripts/sync-versions.js --bump-display     # Increment patch version for display-app only
 *   node scripts/sync-versions.js --bump-all         # Increment patch version for both apps
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

function syncApp(name, packagePath, appPath, shouldBump) {
  const pkg = readJson(packagePath);
  const app = readJson(appPath);
  
  if (!pkg) {
    console.error(`Could not read ${packagePath}`);
    return false;
  }
  
  let targetVersion = pkg.version;
  const appVersion = app?.expo?.version || '0.0.0';
  
  // Use the higher version as base
  const pkgParsed = parseVersion(targetVersion);
  const appParsed = parseVersion(appVersion);
  
  if (appParsed.major > pkgParsed.major || 
      (appParsed.major === pkgParsed.major && appParsed.minor > pkgParsed.minor) ||
      (appParsed.major === pkgParsed.major && appParsed.minor === pkgParsed.minor && appParsed.patch > pkgParsed.patch)) {
    targetVersion = appVersion;
  }
  
  // Bump if requested
  if (shouldBump) {
    targetVersion = bumpPatch(targetVersion);
  }
  
  console.log(`\n📦 ${name}`);
  console.log(`   package.json: ${pkg.version}`);
  console.log(`   app.json:     ${appVersion}`);
  
  if (pkg.version === targetVersion && appVersion === targetVersion && !shouldBump) {
    console.log(`   ✅ Already in sync at ${targetVersion}`);
    return true;
  }
  
  // Update files
  pkg.version = targetVersion;
  writeJson(packagePath, pkg);
  
  if (app?.expo) {
    app.expo.version = targetVersion;
    writeJson(appPath, app);
  }
  
  console.log(`   ✅ Synced to ${targetVersion}`);
  return true;
}

function main() {
  const args = process.argv.slice(2);
  const bumpFrontend = args.includes('--bump') || args.includes('--bump-all');
  const bumpDisplay = args.includes('--bump-display') || args.includes('--bump-all');
  
  console.log('📦 Version Sync Script');
  console.log('======================');
  console.log('Note: Frontend (2.x.x) and Display-app (1.x.x) have separate version tracks');
  
  // Sync frontend (Kassa)
  syncApp(
    'Frontend (QR-Kassan)',
    FILES.frontendPackage,
    FILES.frontendApp,
    bumpFrontend
  );
  
  // Sync display-app
  syncApp(
    'Display-app (QR-Display)',
    FILES.displayPackage,
    FILES.displayApp,
    bumpDisplay
  );
  
  console.log('\n✅ Done!');
}

main();
