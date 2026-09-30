const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const outDir = path.resolve(__dirname, '..', 'screenshots');

const tabs = [
  { name: '03_money_flow_recon.png', tab: 'money-flow' },
  { name: '04_wallet_fingerprint_view.png', tab: 'fingerprint' },
  { name: '05_investigation_hotspots_view.png', tab: 'hotspots' },
  { name: '06_pattern_motifs_view.png', tab: 'motifs' },
  { name: '07_infrastructure_reuse_view.png', tab: 'infrastructure-reuse' },
  { name: '08_hypothesis_board_view.png', tab: 'hypotheses' },
  { name: '09_evidence_lineage_view.png', tab: 'lineage' }
];

async function captureTab(item) {
  const outFile = path.join(outDir, item.name);
  const tempUserDir = path.join(process.env.TEMP || 'C:\\temp', 'edge_' + Math.random().toString(36).substring(2, 6));
  const url = `http://localhost:5173/cases/6aba9bf3a9851671145c7986?tab=${item.tab}`;

  console.log(`Capturing ${item.name} (${item.tab})...`);
  const proc = spawn(edgePath, [
    '--headless=new',
    '--disable-gpu',
    '--window-size=1440,2200',
    `--user-data-dir=${tempUserDir}`,
    `--screenshot=${outFile}`,
    url
  ]);

  await new Promise(r => setTimeout(r, 4500));
  proc.kill();
  try { fs.rmSync(tempUserDir, { recursive: true, force: true }); } catch (e) {}
  const exists = fs.existsSync(outFile);
  const size = exists ? fs.statSync(outFile).size : 0;
  console.log(`  -> ${item.name}: exists=${exists}, size=${size}`);
}

async function main() {
  for (const t of tabs) {
    await captureTab(t);
  }
}

main().then(() => console.log('All workspace screenshots saved.'));
