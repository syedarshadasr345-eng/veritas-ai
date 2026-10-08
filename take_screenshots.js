const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function capture() {
  if (!fs.existsSync('screenshots')) {
    fs.mkdirSync('screenshots');
  }

  console.log('Launching Edge from:', edgePath);
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // 1. Dashboard (1440x900)
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:4173/#dashboard', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 800)); // Allow frosted glass & clock to settle
  await page.screenshot({ path: 'screenshots/dashboard_1440.png' });
  console.log('✓ Captured dashboard_1440.png');

  // 2. Documents Page (1440x900)
  await page.goto('http://localhost:4173/#documents', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: 'screenshots/documents_1440.png' });
  console.log('✓ Captured documents_1440.png');

  // 3. Claims Page (1440x900)
  await page.goto('http://localhost:4173/#claims', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: 'screenshots/claims_1440.png' });
  console.log('✓ Captured claims_1440.png');

  // 4. Verification Page (1440x900)
  await page.goto('http://localhost:4173/#verification', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: 'screenshots/verification_1440.png' });
  console.log('✓ Captured verification_1440.png');

  // 5. Tablet Width (768x1024)
  await page.setViewport({ width: 768, height: 1024 });
  await page.goto('http://localhost:4173/#dashboard', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: 'screenshots/dashboard_tablet_768.png' });
  console.log('✓ Captured dashboard_tablet_768.png');

  // 6. Mobile Width (360x800)
  await page.setViewport({ width: 360, height: 800 });
  await page.goto('http://localhost:4173/#dashboard', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: 'screenshots/dashboard_mobile_360.png' });
  console.log('✓ Captured dashboard_mobile_360.png');

  await browser.close();
  console.log('All screenshots captured successfully!');
}

capture().catch(err => {
  console.error('Error taking screenshots:', err);
  process.exit(1);
});
