#!/usr/bin/env node

/**
 * Color Validation Test
 * Validates that all app background colors match the logo background color
 */

const fs = require('fs');
const path = require('path');

// Logo background color - from new_logo.png
const LOGO_BACKGROUND_COLOR = "#f3f3f4";

// Read App.js file
const appJsPath = path.join(__dirname, 'App.js');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');

// Extract background colors from StyleSheet
const backgroundColorPattern = /backgroundColor:\s*["']([^"']+)["']/g;
const matches = [...appJsContent.matchAll(backgroundColorPattern)];

console.log('\n🧪 Color Validation Test\n');
console.log(`Expected Logo Background Color: ${LOGO_BACKGROUND_COLOR}\n`);

// Key styles to check
const stylesToCheck = ['container', 'topBar', 'activeConditionsSection', 'homeContainer'];
const results = [];

stylesToCheck.forEach(styleName => {
  // Find the style definition
  const stylePattern = new RegExp(`${styleName}:\\s*{[^}]*backgroundColor:\\s*["']([^"']+)["']`, 's');
  const match = appJsContent.match(stylePattern);

  if (match) {
    const color = match[1];
    const matches = color === LOGO_BACKGROUND_COLOR;
    results.push({ styleName, color, matches });

    const icon = matches ? '✅' : '❌';
    console.log(`${icon} ${styleName}: ${color} ${matches ? '(matches)' : '(DOES NOT MATCH)'}`);
  } else {
    console.log(`⚠️  ${styleName}: Not found`);
    results.push({ styleName, color: null, matches: false });
  }
});

// Check if all match
const allMatch = results.every(r => r.matches);

console.log('\n' + '='.repeat(60));
if (allMatch) {
  console.log('✅ ALL TESTS PASSED');
  console.log('All background colors match the logo background color!');
  console.log('='.repeat(60) + '\n');
  process.exit(0);
} else {
  console.log('❌ TESTS FAILED');
  console.log('Some background colors do not match the logo!');
  console.log('='.repeat(60) + '\n');
  process.exit(1);
}
