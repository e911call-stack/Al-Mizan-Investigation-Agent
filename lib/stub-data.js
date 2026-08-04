// Placeholder pipeline-testing data — NOT a verified legal corpus or fee
// schedule. See the planning doc's open questions: the real Jordanian
// corpus is still an unresolved dependency. Every consumer of this data
// tags its output so nothing downstream can mistake it for verified
// authority.

export const STUB_CORPUS = [
  { id: 'jo-civil-544', jurisdiction: 'jordan-civil', citation: 'Jordanian Civil Code — Art. 544', summary: 'Placeholder summary: performance of obligations under a bilateral contract.' },
  { id: 'jo-civil-547', jurisdiction: 'jordan-civil', citation: 'Jordanian Civil Code — Art. 547', summary: 'Placeholder summary: damages arising from breach of a bilateral contract.' },
  { id: 'jo-civil-202', jurisdiction: 'jordan-civil', citation: 'Jordanian Civil Code — Art. 202', summary: 'Placeholder summary: general liability for damage caused by breach of a contractual duty.' },
  { id: 'jo-civil-358', jurisdiction: 'jordan-civil', citation: 'Jordanian Civil Code — Art. 358', summary: 'Placeholder summary: conditions for rescission of a contract for non-performance.' }
];

export const STUB_FEE_TABLE = {
  jurisdiction: 'jordan-civil',
  lastVerifiedDate: '2026-06-02', // placeholder — not a real verification date
  referenceOwner: 'unassigned — stub data for pipeline testing only',
  tiers: [
    { maxValue: 5000, court: 'Amman Magistrate Court', fee: 50, feeCurrency: 'JOD' },
    { maxValue: 100000, court: 'Amman Court of First Instance', fee: 150, feeCurrency: 'JOD' },
    { maxValue: Infinity, court: 'Amman Court of First Instance — Commercial Chamber', fee: 300, feeCurrency: 'JOD' }
  ]
};

export const STUB_NOTICE = 'This is placeholder pipeline-testing data, not a verified legal corpus or fee schedule. Do not use for real filings.';
