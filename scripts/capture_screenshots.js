const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const outDir = path.resolve(__dirname, '..', 'screenshots');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const targets = [
  { name: '01_forensic_landing.png', url: 'http://localhost:5173/' },
  { name: '02_case_briefing.png', url: 'http://localhost:5173/cases/6aba9bf3a9851671145c7986?tab=overview' },
  { name: '03_money_flow_reconstruction.png', url: 'http://localhost:5173/cases/6aba9bf3a9851671145c7986?tab=money-flow' },
  { name: '04_wallet_fingerprint.png', url: 'http://localhost:5173/cases/6aba9bf3a9851671145c7986?tab=fingerprint' },
  { name: '05_investigation_hotspots.png', url: 'http://localhost:5173/cases/6aba9bf3a9851671145c7986?tab=hotspots' },
  { name: '06_transaction_motifs.png', url: 'http://localhost:5173/cases/6aba9bf3a9851671145c7986?tab=motifs' },
  { name: '07_infrastructure_reuse.png', url: 'http://localhost:5173/cases/6aba9bf3a9851671145c7986?tab=infrastructure-reuse' },
  { name: '08_hypothesis_board.png', url: 'http://localhost:5173/cases/6aba9bf3a9851671145c7986?tab=hypotheses' },
  { name: '09_evidence_lineage.png', url: 'http://localhost:5173/cases/6aba9bf3a9851671145c7986?tab=lineage' },
  { name: '10_watchtower_monitoring.png', url: 'http://localhost:5173/monitoring' },
  { name: '11_official_report.png', url: 'http://localhost:5173/reports' },
  { name: '12_developer_api.png', url: 'http://localhost:5173/developers' }
];

async function capture(target) {
  const outFile = path.join(outDir, target.name);
  const tempUserDir = path.join(process.env.TEMP || 'C:\\temp', 'edge_profile_' + Math.random().toString(36).substring(2, 8));
  
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,900',
    `--user-data-dir=${tempUserDir}`,
    `--screenshot=${outFile}`,
    target.url
  ];

  return new Promise((resolve) => {
    console.log(`[Capturing] ${target.name} from ${target.url}...`);
    const proc = spawn(edgePath, args, { stdio: 'ignore' });
    
    // Check every 500ms if file exists; or kill after 4 seconds
    const interval = setInterval(() => {
      if (fs.existsSync(outFile) && fs.statSync(outFile).size > 10000) {
        clearInterval(interval);
        clearTimeout(timer);
        proc.kill();
        const size = fs.statSync(outFile).size;
        console.log(`  -> Saved ${target.name} (${size} bytes)`);
        try { fs.rmSync(tempUserDir, { recursive: true, force: true }); } catch (e) {}
        resolve({ name: target.name, exists: true, size });
      }
    }, 400);

    const timer = setTimeout(() => {
      clearInterval(interval);
      proc.kill();
      const exists = fs.existsSync(outFile);
      const size = exists ? fs.statSync(outFile).size : 0;
      console.log(`  -> Timeout finished ${target.name}. Exists: ${exists}, Size: ${size}`);
      try { fs.rmSync(tempUserDir, { recursive: true, force: true }); } catch (e) {}
      resolve({ name: target.name, exists, size });
    }, 4500);
  });
}

async function runAll() {
  for (const t of targets) {
    await capture(t);
  }
}

runAll().then(() => console.log('Done capturing forensic QA screenshots.'));
