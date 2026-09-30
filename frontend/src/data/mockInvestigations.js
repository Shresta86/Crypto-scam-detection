/**
 * Mock investigation datasets for TraceX Investigate module.
 * Each dataset contains: graph nodes/edges, transactions, risk signals, 
 * VASP attributions, and investigation metadata.
 */

const DATASETS = {
  'task-scam': {
    id: 'TX-2026-TASK01',
    label: 'Task Scam Network',
    typology: 'Task Scam',
    description: 'Victim deposited funds into a "task completion" platform that required escalating deposits. Funds rapidly consolidated through intermediary wallets before reaching exchange off-ramps.',
    startWallet: '0x1a2b3c4d5e6f7890abcdef1234567890abcdef01',
    risk: { score: 92, level: 'CRITICAL', factors: ['Rapid consolidation pattern', 'Known scam platform linkage', 'Fan-out to multiple exchanges', 'Timing correlation with reported losses'] },
    graph: {
      nodes: [
        { id: 'n1', address: '0x1a2b3c4d5e6f7890abcdef1234567890abcdef01', type: 'SUSPECT_WALLET', label: 'Victim Deposit Wallet', hop: 0 },
        { id: 'n2', address: '0x2b3c4d5e6f7890abcdef1234567890abcdef0102', type: 'INTERMEDIARY', label: 'Consolidation Hub A', hop: 1 },
        { id: 'n3', address: '0x3c4d5e6f7890abcdef1234567890abcdef010203', type: 'INTERMEDIARY', label: 'Consolidation Hub B', hop: 1 },
        { id: 'n4', address: '0x4d5e6f7890abcdef1234567890abcdef01020304', type: 'INTERMEDIARY', label: 'Layering Wallet', hop: 2 },
        { id: 'n5', address: '0x5e6f7890abcdef1234567890abcdef0102030405', type: 'INTERMEDIARY', label: 'Pre-Exchange Mixer', hop: 2 },
        { id: 'n6', address: '0x6f7890abcdef1234567890abcdef010203040506', type: 'EXCHANGE_VASP', label: 'Exchange Hot Wallet (Alpha)', hop: 3, entity: 'Alpha Exchange' },
        { id: 'n7', address: '0x7890abcdef1234567890abcdef01020304050607', type: 'EXCHANGE_VASP', label: 'Exchange Hot Wallet (Beta)', hop: 3, entity: 'Beta Exchange' },
        { id: 'n8', address: '0x890abcdef1234567890abcdef0102030405060708', type: 'WALLET', label: 'Peripheral Wallet', hop: 2 },
        { id: 'n9', address: '0x90abcdef1234567890abcdef010203040506070809', type: 'WALLET', label: 'Related Deposit', hop: 1 },
        { id: 'n10', address: '0xa0bcdef1234567890abcdef0102030405060708090a', type: 'INTERMEDIARY', label: 'Secondary Layering', hop: 2 },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2', amount: 4.5, asset: 'ETH', hop: 1, timestamp: '2026-09-15T08:30:00Z', type: 'TRANSFERRED_TO' },
        { id: 'e2', source: 'n1', target: 'n3', amount: 3.2, asset: 'ETH', hop: 1, timestamp: '2026-09-15T08:32:00Z', type: 'TRANSFERRED_TO' },
        { id: 'e3', source: 'n2', target: 'n4', amount: 4.4, asset: 'ETH', hop: 2, timestamp: '2026-09-15T09:15:00Z', type: 'TRANSFERRED_TO' },
        { id: 'e4', source: 'n3', target: 'n5', amount: 3.1, asset: 'ETH', hop: 2, timestamp: '2026-09-15T09:18:00Z', type: 'TRANSFERRED_TO' },
        { id: 'e5', source: 'n4', target: 'n6', amount: 4.3, asset: 'ETH', hop: 3, timestamp: '2026-09-15T10:45:00Z', type: 'TRANSFERRED_TO' },
        { id: 'e6', source: 'n5', target: 'n7', amount: 3.0, asset: 'ETH', hop: 3, timestamp: '2026-09-15T10:50:00Z', type: 'TRANSFERRED_TO' },
        { id: 'e7', source: 'n9', target: 'n2', amount: 1.8, asset: 'ETH', hop: 1, timestamp: '2026-09-15T07:00:00Z', type: 'TRANSFERRED_TO' },
        { id: 'e8', source: 'n2', target: 'n8', amount: 0.5, asset: 'ETH', hop: 2, timestamp: '2026-09-15T09:00:00Z', type: 'TRANSFERRED_TO' },
        { id: 'e9', source: 'n3', target: 'n10', amount: 0.8, asset: 'ETH', hop: 2, timestamp: '2026-09-15T09:20:00Z', type: 'TRANSFERRED_TO' },
        { id: 'e10', source: 'n10', target: 'n6', amount: 0.7, asset: 'ETH', hop: 3, timestamp: '2026-09-15T11:00:00Z', type: 'TRANSFERRED_TO' },
      ]
    },
    transactions: [
      { hash: '0xaaa111', from: '0x1a2b3c4d5e6f7890abcdef1234567890abcdef01', to: '0x2b3c4d5e6f7890abcdef1234567890abcdef0102', amount: 4.5, asset: 'ETH', direction: 'OUT', hop: 1, timestamp: '2026-09-15T08:30:00Z', block: 18500001 },
      { hash: '0xaaa222', from: '0x1a2b3c4d5e6f7890abcdef1234567890abcdef01', to: '0x3c4d5e6f7890abcdef1234567890abcdef010203', amount: 3.2, asset: 'ETH', direction: 'OUT', hop: 1, timestamp: '2026-09-15T08:32:00Z', block: 18500003 },
      { hash: '0xaaa333', from: '0x2b3c4d5e6f7890abcdef1234567890abcdef0102', to: '0x4d5e6f7890abcdef1234567890abcdef01020304', amount: 4.4, asset: 'ETH', direction: 'OUT', hop: 2, timestamp: '2026-09-15T09:15:00Z', block: 18500050 },
      { hash: '0xaaa444', from: '0x3c4d5e6f7890abcdef1234567890abcdef010203', to: '0x5e6f7890abcdef1234567890abcdef0102030405', amount: 3.1, asset: 'ETH', direction: 'OUT', hop: 2, timestamp: '2026-09-15T09:18:00Z', block: 18500055 },
      { hash: '0xaaa555', from: '0x4d5e6f7890abcdef1234567890abcdef01020304', to: '0x6f7890abcdef1234567890abcdef010203040506', amount: 4.3, asset: 'ETH', direction: 'OUT', hop: 3, timestamp: '2026-09-15T10:45:00Z', block: 18500200 },
      { hash: '0xaaa666', from: '0x5e6f7890abcdef1234567890abcdef0102030405', to: '0x7890abcdef1234567890abcdef01020304050607', amount: 3.0, asset: 'ETH', direction: 'OUT', hop: 3, timestamp: '2026-09-15T10:50:00Z', block: 18500210 },
    ],
    exchangeAttributions: [
      { address: '0x6f7890abcdef1234567890abcdef010203040506', entity: 'Alpha Exchange', confidence: 'HIGH', method: 'Clustering + Deposit Address' },
      { address: '0x7890abcdef1234567890abcdef01020304050607', entity: 'Beta Exchange', confidence: 'MEDIUM', method: 'Heuristic Attribution' },
    ]
  },

  'pig-butchering': {
    id: 'TX-2026-PIG01',
    label: 'Pig Butchering Ring',
    typology: 'Pig Butchering',
    description: 'Romance/investment scam where victims were "fattened up" with small returns before large deposits were drained. Multi-stage laundering through DeFi protocols.',
    startWallet: '0xdead0001beef0001cafe0001face0001babe0001',
    risk: { score: 97, level: 'CRITICAL', factors: ['Romance scam behavioral signature', 'DeFi protocol obfuscation', 'Cross-border VASP endpoints', 'Multiple victim convergence', 'Temporal burst pattern'] },
    graph: {
      nodes: [
        { id: 'p1', address: '0xdead0001beef0001cafe0001face0001babe0001', type: 'SUSPECT_WALLET', label: 'Scam Platform Wallet', hop: 0 },
        { id: 'p2', address: '0xdead0002beef0002cafe0002face0002babe0002', type: 'WALLET', label: 'Victim A Deposit', hop: 0 },
        { id: 'p3', address: '0xdead0003beef0003cafe0003face0003babe0003', type: 'WALLET', label: 'Victim B Deposit', hop: 0 },
        { id: 'p4', address: '0xdead0004beef0004cafe0004face0004babe0004', type: 'INTERMEDIARY', label: 'DeFi Pool Interaction', hop: 1 },
        { id: 'p5', address: '0xdead0005beef0005cafe0005face0005babe0005', type: 'INTERMEDIARY', label: 'Token Swap Router', hop: 1 },
        { id: 'p6', address: '0xdead0006beef0006cafe0006face0006babe0006', type: 'INTERMEDIARY', label: 'Bridge Contract', hop: 2 },
        { id: 'p7', address: '0xdead0007beef0007cafe0007face0007babe0007', type: 'INTERMEDIARY', label: 'Consolidation Node', hop: 2 },
        { id: 'p8', address: '0xdead0008beef0008cafe0008face0008babe0008', type: 'EXCHANGE_VASP', label: 'Global Exchange (Gamma)', hop: 3, entity: 'Gamma Exchange' },
        { id: 'p9', address: '0xdead0009beef0009cafe0009face0009babe0009', type: 'EXCHANGE_VASP', label: 'P2P Platform (Delta)', hop: 3, entity: 'Delta P2P' },
        { id: 'p10', address: '0xdead000abee000acafe000aface000ababe000a', type: 'WALLET', label: 'Victim C Deposit', hop: 0 },
        { id: 'p11', address: '0xdead000bbee000bcafe000bface000bbabe000b', type: 'INTERMEDIARY', label: 'Aggregation Point', hop: 1 },
        { id: 'p12', address: '0xdead000cbee000ccafe000cface000cbabe000c', type: 'bridge', label: 'Cross-Chain Bridge', hop: 2 },
      ],
      edges: [
        { id: 'pe1', source: 'p2', target: 'p1', amount: 12.5, asset: 'ETH', hop: 0, timestamp: '2026-08-01T14:00:00Z', type: 'DEPOSITED_TO' },
        { id: 'pe2', source: 'p3', target: 'p1', amount: 8.3, asset: 'ETH', hop: 0, timestamp: '2026-08-05T16:00:00Z', type: 'DEPOSITED_TO' },
        { id: 'pe3', source: 'p10', target: 'p1', amount: 15.0, asset: 'ETH', hop: 0, timestamp: '2026-08-10T10:00:00Z', type: 'DEPOSITED_TO' },
        { id: 'pe4', source: 'p1', target: 'p4', amount: 20.0, asset: 'ETH', hop: 1, timestamp: '2026-08-12T02:00:00Z', type: 'TRANSFERRED_TO' },
        { id: 'pe5', source: 'p1', target: 'p5', amount: 15.0, asset: 'USDT', hop: 1, timestamp: '2026-08-12T02:05:00Z', type: 'SWAPPED_VIA' },
        { id: 'pe6', source: 'p4', target: 'p7', amount: 19.5, asset: 'ETH', hop: 2, timestamp: '2026-08-12T04:00:00Z', type: 'TRANSFERRED_TO' },
        { id: 'pe7', source: 'p5', target: 'p6', amount: 14.8, asset: 'USDT', hop: 2, timestamp: '2026-08-12T04:30:00Z', type: 'BRIDGED_VIA' },
        { id: 'pe8', source: 'p7', target: 'p8', amount: 19.0, asset: 'ETH', hop: 3, timestamp: '2026-08-12T06:00:00Z', type: 'TRANSFERRED_TO' },
        { id: 'pe9', source: 'p6', target: 'p9', amount: 14.5, asset: 'USDT', hop: 3, timestamp: '2026-08-12T08:00:00Z', type: 'TRANSFERRED_TO' },
        { id: 'pe10', source: 'p1', target: 'p11', amount: 5.0, asset: 'ETH', hop: 1, timestamp: '2026-08-13T01:00:00Z', type: 'TRANSFERRED_TO' },
        { id: 'pe11', source: 'p11', target: 'p12', amount: 4.8, asset: 'ETH', hop: 2, timestamp: '2026-08-13T03:00:00Z', type: 'BRIDGED_VIA' },
      ]
    },
    transactions: [
      { hash: '0xbbb111', from: '0xdead0002beef0002cafe0002face0002babe0002', to: '0xdead0001beef0001cafe0001face0001babe0001', amount: 12.5, asset: 'ETH', direction: 'IN', hop: 0, timestamp: '2026-08-01T14:00:00Z', block: 18400001 },
      { hash: '0xbbb222', from: '0xdead0003beef0003cafe0003face0003babe0003', to: '0xdead0001beef0001cafe0001face0001babe0001', amount: 8.3, asset: 'ETH', direction: 'IN', hop: 0, timestamp: '2026-08-05T16:00:00Z', block: 18430001 },
      { hash: '0xbbb333', from: '0xdead000abee000acafe000aface000ababe000a', to: '0xdead0001beef0001cafe0001face0001babe0001', amount: 15.0, asset: 'ETH', direction: 'IN', hop: 0, timestamp: '2026-08-10T10:00:00Z', block: 18460001 },
      { hash: '0xbbb444', from: '0xdead0001beef0001cafe0001face0001babe0001', to: '0xdead0004beef0004cafe0004face0004babe0004', amount: 20.0, asset: 'ETH', direction: 'OUT', hop: 1, timestamp: '2026-08-12T02:00:00Z', block: 18470001 },
      { hash: '0xbbb555', from: '0xdead0001beef0001cafe0001face0001babe0001', to: '0xdead0005beef0005cafe0005face0005babe0005', amount: 15.0, asset: 'USDT', direction: 'OUT', hop: 1, timestamp: '2026-08-12T02:05:00Z', block: 18470005 },
    ],
    exchangeAttributions: [
      { address: '0xdead0008beef0008cafe0008face0008babe0008', entity: 'Gamma Exchange', confidence: 'HIGH', method: 'VASP Registry Match' },
      { address: '0xdead0009beef0009cafe0009face0009babe0009', entity: 'Delta P2P', confidence: 'MEDIUM', method: 'Behavioral Clustering' },
    ]
  },

  'job-scam': {
    id: 'TX-2026-JOB01',
    label: 'Job Scam Operation',
    typology: 'Job Scam',
    description: 'Victims recruited for fake remote jobs, required to deposit "work capital". Funds channeled through a narrow set of intermediaries to a single exchange.',
    startWallet: '0xfeed0001dead0001beef0001cafe0001face0001',
    risk: { score: 78, level: 'HIGH', factors: ['Employment scam pattern', 'Narrow intermediary funnel', 'Single exchange concentration', 'Repetitive deposit amounts'] },
    graph: {
      nodes: [
        { id: 'j1', address: '0xfeed0001dead0001beef0001cafe0001face0001', type: 'SUSPECT_WALLET', label: 'Scam Recruiter Wallet', hop: 0 },
        { id: 'j2', address: '0xfeed0002dead0002beef0002cafe0002face0002', type: 'WALLET', label: 'Victim D', hop: 0 },
        { id: 'j3', address: '0xfeed0003dead0003beef0003cafe0003face0003', type: 'WALLET', label: 'Victim E', hop: 0 },
        { id: 'j4', address: '0xfeed0004dead0004beef0004cafe0004face0004', type: 'INTERMEDIARY', label: 'Collector Wallet', hop: 1 },
        { id: 'j5', address: '0xfeed0005dead0005beef0005cafe0005face0005', type: 'EXCHANGE_VASP', label: 'Exchange (Epsilon)', hop: 2, entity: 'Epsilon Exchange' },
        { id: 'j6', address: '0xfeed0006dead0006beef0006cafe0006face0006', type: 'WALLET', label: 'Victim F', hop: 0 },
        { id: 'j7', address: '0xfeed0007dead0007beef0007cafe0007face0007', type: 'INTERMEDIARY', label: 'Staging Wallet', hop: 1 },
      ],
      edges: [
        { id: 'je1', source: 'j2', target: 'j1', amount: 0.5, asset: 'ETH', hop: 0, timestamp: '2026-09-01T10:00:00Z', type: 'DEPOSITED_TO' },
        { id: 'je2', source: 'j3', target: 'j1', amount: 0.5, asset: 'ETH', hop: 0, timestamp: '2026-09-02T10:00:00Z', type: 'DEPOSITED_TO' },
        { id: 'je3', source: 'j6', target: 'j1', amount: 0.5, asset: 'ETH', hop: 0, timestamp: '2026-09-03T10:00:00Z', type: 'DEPOSITED_TO' },
        { id: 'je4', source: 'j1', target: 'j4', amount: 1.4, asset: 'ETH', hop: 1, timestamp: '2026-09-04T02:00:00Z', type: 'TRANSFERRED_TO' },
        { id: 'je5', source: 'j1', target: 'j7', amount: 0.4, asset: 'ETH', hop: 1, timestamp: '2026-09-04T02:30:00Z', type: 'TRANSFERRED_TO' },
        { id: 'je6', source: 'j4', target: 'j5', amount: 1.35, asset: 'ETH', hop: 2, timestamp: '2026-09-04T05:00:00Z', type: 'TRANSFERRED_TO' },
        { id: 'je7', source: 'j7', target: 'j5', amount: 0.38, asset: 'ETH', hop: 2, timestamp: '2026-09-04T05:30:00Z', type: 'TRANSFERRED_TO' },
      ]
    },
    transactions: [
      { hash: '0xccc111', from: '0xfeed0002dead0002beef0002cafe0002face0002', to: '0xfeed0001dead0001beef0001cafe0001face0001', amount: 0.5, asset: 'ETH', direction: 'IN', hop: 0, timestamp: '2026-09-01T10:00:00Z', block: 18550001 },
      { hash: '0xccc222', from: '0xfeed0003dead0003beef0003cafe0003face0003', to: '0xfeed0001dead0001beef0001cafe0001face0001', amount: 0.5, asset: 'ETH', direction: 'IN', hop: 0, timestamp: '2026-09-02T10:00:00Z', block: 18557001 },
      { hash: '0xccc333', from: '0xfeed0006dead0006beef0006cafe0006face0006', to: '0xfeed0001dead0001beef0001cafe0001face0001', amount: 0.5, asset: 'ETH', direction: 'IN', hop: 0, timestamp: '2026-09-03T10:00:00Z', block: 18564001 },
      { hash: '0xccc444', from: '0xfeed0001dead0001beef0001cafe0001face0001', to: '0xfeed0004dead0004beef0004cafe0004face0004', amount: 1.4, asset: 'ETH', direction: 'OUT', hop: 1, timestamp: '2026-09-04T02:00:00Z', block: 18570001 },
    ],
    exchangeAttributions: [
      { address: '0xfeed0005dead0005beef0005cafe0005face0005', entity: 'Epsilon Exchange', confidence: 'HIGH', method: 'VASP Registry Match' },
    ]
  },

  'ransomware': {
    id: 'TX-2026-RAN01',
    label: 'Ransomware Payment Trail',
    typology: 'Ransomware',
    description: 'Corporate ransom payment traced through privacy-enhanced mixing operations. Funds fragmented across multiple intermediary chains before partial exchange deposit.',
    startWallet: '0xbad00001evil0001hack0001lock0001pay00001',
    risk: { score: 99, level: 'CRITICAL', factors: ['Ransomware payment confirmed', 'Mixing service usage', 'Privacy protocol interaction', 'Known ransomware group cluster', 'High-value fragmentation'] },
    graph: {
      nodes: [
        { id: 'r1', address: '0xbad00001evil0001hack0001lock0001pay00001', type: 'SUSPECT_WALLET', label: 'Ransom Payment Wallet', hop: 0 },
        { id: 'r2', address: '0xbad00002evil0002hack0002lock0002pay00002', type: 'INTERMEDIARY', label: 'Mixer Input', hop: 1 },
        { id: 'r3', address: '0xbad00003evil0003hack0003lock0003pay00003', type: 'INTERMEDIARY', label: 'Mixer Output A', hop: 2 },
        { id: 'r4', address: '0xbad00004evil0004hack0004lock0004pay00004', type: 'INTERMEDIARY', label: 'Mixer Output B', hop: 2 },
        { id: 'r5', address: '0xbad00005evil0005hack0005lock0005pay00005', type: 'INTERMEDIARY', label: 'Mixer Output C', hop: 2 },
        { id: 'r6', address: '0xbad00006evil0006hack0006lock0006pay00006', type: 'INTERMEDIARY', label: 'Aggregation Wallet', hop: 3 },
        { id: 'r7', address: '0xbad00007evil0007hack0007lock0007pay00007', type: 'EXCHANGE_VASP', label: 'Exchange (Zeta)', hop: 4, entity: 'Zeta Exchange' },
        { id: 'r8', address: '0xbad00008evil0008hack0008lock0008pay00008', type: 'INTERMEDIARY', label: 'Dormant Wallet', hop: 3 },
        { id: 'r9', address: '0xbad00009evil0009hack0009lock0009pay00009', type: 'WALLET', label: 'Unknown Destination', hop: 3 },
        { id: 'r10', address: '0xbad0000aevil000ahack000alock000apay0000a', type: 'bridge', label: 'Privacy Bridge', hop: 2 },
        { id: 'r11', address: '0xbad0000bevil000bhack000block000bpay0000b', type: 'INTERMEDIARY', label: 'Post-Bridge Wallet', hop: 3 },
        { id: 'r12', address: '0xbad0000cevil000chack000clock000cpay0000c', type: 'EXCHANGE_VASP', label: 'DEX Aggregator', hop: 4, entity: 'Omega DEX' },
      ],
      edges: [
        { id: 're1', source: 'r1', target: 'r2', amount: 50.0, asset: 'ETH', hop: 1, timestamp: '2026-07-20T00:00:00Z', type: 'TRANSFERRED_TO' },
        { id: 're2', source: 'r2', target: 'r3', amount: 16.5, asset: 'ETH', hop: 2, timestamp: '2026-07-20T01:00:00Z', type: 'MIXED_VIA' },
        { id: 're3', source: 'r2', target: 'r4', amount: 16.5, asset: 'ETH', hop: 2, timestamp: '2026-07-20T01:05:00Z', type: 'MIXED_VIA' },
        { id: 're4', source: 'r2', target: 'r5', amount: 16.5, asset: 'ETH', hop: 2, timestamp: '2026-07-20T01:10:00Z', type: 'MIXED_VIA' },
        { id: 're5', source: 'r3', target: 'r6', amount: 16.0, asset: 'ETH', hop: 3, timestamp: '2026-07-20T06:00:00Z', type: 'TRANSFERRED_TO' },
        { id: 're6', source: 'r4', target: 'r6', amount: 16.0, asset: 'ETH', hop: 3, timestamp: '2026-07-20T06:30:00Z', type: 'TRANSFERRED_TO' },
        { id: 're7', source: 'r5', target: 'r8', amount: 10.0, asset: 'ETH', hop: 3, timestamp: '2026-07-20T07:00:00Z', type: 'TRANSFERRED_TO' },
        { id: 're8', source: 'r5', target: 'r9', amount: 6.0, asset: 'ETH', hop: 3, timestamp: '2026-07-20T07:30:00Z', type: 'TRANSFERRED_TO' },
        { id: 're9', source: 'r6', target: 'r7', amount: 31.5, asset: 'ETH', hop: 4, timestamp: '2026-07-21T12:00:00Z', type: 'TRANSFERRED_TO' },
        { id: 're10', source: 'r1', target: 'r10', amount: 5.0, asset: 'ETH', hop: 1, timestamp: '2026-07-20T00:30:00Z', type: 'BRIDGED_VIA' },
        { id: 're11', source: 'r10', target: 'r11', amount: 4.8, asset: 'ETH', hop: 3, timestamp: '2026-07-20T02:00:00Z', type: 'TRANSFERRED_TO' },
        { id: 're12', source: 'r11', target: 'r12', amount: 4.5, asset: 'ETH', hop: 4, timestamp: '2026-07-20T04:00:00Z', type: 'SWAPPED_VIA' },
      ]
    },
    transactions: [
      { hash: '0xddd111', from: '0xbad00001evil0001hack0001lock0001pay00001', to: '0xbad00002evil0002hack0002lock0002pay00002', amount: 50.0, asset: 'ETH', direction: 'OUT', hop: 1, timestamp: '2026-07-20T00:00:00Z', block: 18300001 },
      { hash: '0xddd222', from: '0xbad00002evil0002hack0002lock0002pay00002', to: '0xbad00003evil0003hack0003lock0003pay00003', amount: 16.5, asset: 'ETH', direction: 'OUT', hop: 2, timestamp: '2026-07-20T01:00:00Z', block: 18300050 },
      { hash: '0xddd333', from: '0xbad00002evil0002hack0002lock0002pay00002', to: '0xbad00004evil0004hack0004lock0004pay00004', amount: 16.5, asset: 'ETH', direction: 'OUT', hop: 2, timestamp: '2026-07-20T01:05:00Z', block: 18300055 },
      { hash: '0xddd444', from: '0xbad00002evil0002hack0002lock0002pay00002', to: '0xbad00005evil0005hack0005lock0005pay00005', amount: 16.5, asset: 'ETH', direction: 'OUT', hop: 2, timestamp: '2026-07-20T01:10:00Z', block: 18300060 },
      { hash: '0xddd555', from: '0xbad00006evil0006hack0006lock0006pay00006', to: '0xbad00007evil0007hack0007lock0007pay00007', amount: 31.5, asset: 'ETH', direction: 'OUT', hop: 4, timestamp: '2026-07-21T12:00:00Z', block: 18310001 },
    ],
    exchangeAttributions: [
      { address: '0xbad00007evil0007hack0007lock0007pay00007', entity: 'Zeta Exchange', confidence: 'HIGH', method: 'VASP Registry Match' },
      { address: '0xbad0000cevil000chack000clock000cpay0000c', entity: 'Omega DEX', confidence: 'LOW', method: 'Behavioral Heuristic' },
    ]
  }
};

export function getDataset(key) {
  return DATASETS[key] || null;
}

export function getDatasetList() {
  return Object.entries(DATASETS).map(([key, ds]) => ({
    key,
    id: ds.id,
    label: ds.label,
    typology: ds.typology,
    description: ds.description,
    nodeCount: ds.graph.nodes.length,
    edgeCount: ds.graph.edges.length,
    riskScore: ds.risk.score,
    riskLevel: ds.risk.level,
  }));
}

export default DATASETS;
