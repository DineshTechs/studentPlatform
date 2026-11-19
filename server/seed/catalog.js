// Examination catalogue, syllabus skeleton and pattern versions used to seed a new database.
// Official patterns reflect public information as of late 2026; administrators must verify
// them against each year's official notification before using them for real candidates.

export const CATEGORIES = [
  ['civil-services', 'Civil Services'], ['engineering', 'Engineering'], ['medical', 'Medical'],
  ['staff-selection', 'Staff Selection'], ['banking', 'Banking'], ['railways', 'Railways'],
  ['defence', 'Defence'], ['other', 'Other Examinations'],
];

const ALL_LANGS = ['en', 'hi', 'as', 'bn', 'gu', 'kn', 'ml', 'mr', 'or', 'pa', 'ta', 'te', 'ur'];
const EN_HI = ['en', 'hi'];
const STAGE_PRACTICE = { key: 'practice', name: 'Short practice format' };

// [slug, name, category, languages, stages, info]
export const EXAMS = [
  ['upsc-cse-prelims', 'UPSC CSE Prelims', 'civil-services', EN_HI, [{ key: 'gs1', name: 'General Studies Paper I' }, { key: 'csat', name: 'CSAT (Paper II)' }, STAGE_PRACTICE], { conductingBody: 'Union Public Service Commission', frequency: 'Annual', officialWebsite: 'https://upsc.gov.in' }],
  ['upsc-cse-mains', 'UPSC CSE Mains', 'civil-services', EN_HI, [{ key: 'gs', name: 'General Studies papers' }, STAGE_PRACTICE], { conductingBody: 'Union Public Service Commission', frequency: 'Annual', officialWebsite: 'https://upsc.gov.in' }],
  ['upsc-optional', 'UPSC Optional Subjects', 'civil-services', EN_HI, [{ key: 'main', name: 'Optional papers' }], { conductingBody: 'Union Public Service Commission', officialWebsite: 'https://upsc.gov.in' }],
  ['upsc-interview', 'UPSC Interview Preparation', 'civil-services', EN_HI, [{ key: 'main', name: 'Personality test' }], { conductingBody: 'Union Public Service Commission', officialWebsite: 'https://upsc.gov.in' }],
  ['jee-main', 'JEE Main', 'engineering', ALL_LANGS, [{ key: 'paper1', name: 'Paper 1 (B.E./B.Tech)' }, STAGE_PRACTICE], { conductingBody: 'National Testing Agency', frequency: 'Two sessions a year', officialWebsite: 'https://jeemain.nta.nic.in' }],
  ['jee-advanced', 'JEE Advanced', 'engineering', EN_HI, [{ key: 'paper1', name: 'Paper 1' }, { key: 'paper2', name: 'Paper 2' }, STAGE_PRACTICE], { conductingBody: 'IITs (organising institute rotates)', frequency: 'Annual', officialWebsite: 'https://jeeadv.ac.in' }],
  ['neet-ug', 'NEET UG', 'medical', ALL_LANGS, [{ key: 'main', name: 'NEET (UG)' }, STAGE_PRACTICE], { conductingBody: 'National Testing Agency', frequency: 'Annual', officialWebsite: 'https://neet.nta.nic.in' }],
  ['ssc-cgl', 'SSC CGL', 'staff-selection', EN_HI, [{ key: 'tier1', name: 'Tier 1' }, { key: 'tier2', name: 'Tier 2' }, STAGE_PRACTICE], { conductingBody: 'Staff Selection Commission', frequency: 'Annual', officialWebsite: 'https://ssc.gov.in' }],
  ['ssc-chsl', 'SSC CHSL', 'staff-selection', EN_HI, [{ key: 'tier1', name: 'Tier 1' }, { key: 'tier2', name: 'Tier 2' }], { conductingBody: 'Staff Selection Commission', officialWebsite: 'https://ssc.gov.in' }],
  ['ssc-mts', 'SSC MTS', 'staff-selection', EN_HI, [{ key: 'main', name: 'Computer based exam' }], { conductingBody: 'Staff Selection Commission', officialWebsite: 'https://ssc.gov.in' }],
  ['ssc-gd', 'SSC GD', 'staff-selection', EN_HI, [{ key: 'main', name: 'Computer based exam' }], { conductingBody: 'Staff Selection Commission', officialWebsite: 'https://ssc.gov.in' }],
  ['ssc-cpo', 'SSC CPO', 'staff-selection', EN_HI, [{ key: 'paper1', name: 'Paper I' }, { key: 'paper2', name: 'Paper II' }], { conductingBody: 'Staff Selection Commission', officialWebsite: 'https://ssc.gov.in' }],
  ['ssc-je', 'SSC JE', 'staff-selection', EN_HI, [{ key: 'paper1', name: 'Paper I' }, { key: 'paper2', name: 'Paper II' }], { conductingBody: 'Staff Selection Commission', officialWebsite: 'https://ssc.gov.in' }],
  ['ibps-po', 'IBPS PO', 'banking', EN_HI, [{ key: 'prelims', name: 'Preliminary' }, { key: 'mains', name: 'Main' }], { conductingBody: 'Institute of Banking Personnel Selection', officialWebsite: 'https://www.ibps.in' }],
  ['ibps-clerk', 'IBPS Clerk', 'banking', EN_HI, [{ key: 'prelims', name: 'Preliminary' }, { key: 'mains', name: 'Main' }], { conductingBody: 'Institute of Banking Personnel Selection', officialWebsite: 'https://www.ibps.in' }],
  ['sbi-po', 'SBI PO', 'banking', EN_HI, [{ key: 'prelims', name: 'Preliminary' }, { key: 'mains', name: 'Main' }], { conductingBody: 'State Bank of India', officialWebsite: 'https://sbi.co.in/web/careers' }],
  ['sbi-clerk', 'SBI Clerk', 'banking', EN_HI, [{ key: 'prelims', name: 'Preliminary' }, { key: 'mains', name: 'Main' }], { conductingBody: 'State Bank of India', officialWebsite: 'https://sbi.co.in/web/careers' }],
  ['rbi-grade-b', 'RBI Grade B', 'banking', EN_HI, [{ key: 'phase1', name: 'Phase I' }, { key: 'phase2', name: 'Phase II' }], { conductingBody: 'Reserve Bank of India', officialWebsite: 'https://opportunities.rbi.org.in' }],
  ['rbi-assistant', 'RBI Assistant', 'banking', EN_HI, [{ key: 'prelims', name: 'Preliminary' }, { key: 'mains', name: 'Main' }], { conductingBody: 'Reserve Bank of India', officialWebsite: 'https://opportunities.rbi.org.in' }],
  ['rrb-ntpc', 'RRB NTPC', 'railways', ALL_LANGS, [{ key: 'cbt1', name: 'CBT 1' }, { key: 'cbt2', name: 'CBT 2' }], { conductingBody: 'Railway Recruitment Boards', officialWebsite: 'https://indianrailways.gov.in' }],
  ['rrb-group-d', 'RRB Group D', 'railways', ALL_LANGS, [{ key: 'cbt', name: 'CBT' }], { conductingBody: 'Railway Recruitment Boards', officialWebsite: 'https://indianrailways.gov.in' }],
  ['rrb-alp', 'RRB ALP', 'railways', ALL_LANGS, [{ key: 'cbt1', name: 'CBT 1' }, { key: 'cbt2', name: 'CBT 2' }], { conductingBody: 'Railway Recruitment Boards', officialWebsite: 'https://indianrailways.gov.in' }],
  ['nda', 'NDA', 'defence', EN_HI, [{ key: 'maths', name: 'Mathematics' }, { key: 'gat', name: 'General Ability Test' }], { conductingBody: 'Union Public Service Commission', officialWebsite: 'https://upsc.gov.in' }],
  ['cds', 'CDS', 'defence', EN_HI, [{ key: 'main', name: 'Written examination' }], { conductingBody: 'Union Public Service Commission', officialWebsite: 'https://upsc.gov.in' }],
  ['afcat', 'AFCAT', 'defence', ['en'], [{ key: 'main', name: 'Online test' }], { conductingBody: 'Indian Air Force', officialWebsite: 'https://afcat.cdac.in' }],
  ['cuet-ug', 'CUET UG', 'other', ALL_LANGS, [{ key: 'main', name: 'CUET (UG)' }], { conductingBody: 'National Testing Agency', officialWebsite: 'https://cuet.nta.nic.in' }],
  ['cuet-pg', 'CUET PG', 'other', EN_HI, [{ key: 'main', name: 'CUET (PG)' }], { conductingBody: 'National Testing Agency', officialWebsite: 'https://pgcuet.samarth.ac.in' }],
  ['ctet', 'CTET', 'other', EN_HI, [{ key: 'paper1', name: 'Paper I' }, { key: 'paper2', name: 'Paper II' }], { conductingBody: 'Central Board of Secondary Education', officialWebsite: 'https://ctet.nic.in' }],
];

// subject key → { name, exams, chapters: { chapterKey: [name, { topicKey: name }] } }
export const SYLLABUS = {
  physics: { name: 'Physics', exams: ['jee-main', 'jee-advanced', 'neet-ug'], chapters: {
    kinematics: ['Kinematics', { 'motion-1d': 'Motion in a straight line', projectile: 'Projectile motion' }],
    'laws-of-motion': ['Laws of Motion', { 'newton-laws': "Newton's laws", friction: 'Friction' }],
    electrostatics: ['Electrostatics', { coulomb: "Coulomb's law", potential: 'Electric potential' }],
  } },
  chemistry: { name: 'Chemistry', exams: ['jee-main', 'jee-advanced', 'neet-ug'], chapters: {
    'mole-concept': ['Some Basic Concepts of Chemistry', { stoichiometry: 'Mole concept & stoichiometry' }],
    'atomic-structure': ['Atomic Structure', { 'quantum-numbers': 'Quantum numbers & orbitals' }],
    bonding: ['Chemical Bonding', { hybridisation: 'Hybridisation & VSEPR' }],
    periodic: ['Classification of Elements', { 'periodic-trends': 'Periodic trends' }],
  } },
  mathematics: { name: 'Mathematics', exams: ['jee-main', 'jee-advanced', 'nda'], chapters: {
    algebra: ['Algebra', { quadratic: 'Quadratic equations', sequences: 'Sequences & series' }],
    calculus: ['Calculus', { limits: 'Limits', derivatives: 'Differentiation' }],
    coordinate: ['Coordinate Geometry', { 'straight-lines': 'Straight lines' }],
  } },
  biology: { name: 'Biology', exams: ['neet-ug'], chapters: {
    cell: ['Cell: Structure and Function', { organelles: 'Cell organelles' }],
    genetics: ['Genetics', { mendelian: 'Mendelian inheritance' }],
    physiology: ['Human Physiology', { circulation: 'Body fluids & circulation', digestion: 'Digestion' }],
  } },
  quant: { name: 'Quantitative Aptitude', exams: ['ssc-cgl', 'ssc-chsl', 'ssc-mts', 'ibps-po', 'ibps-clerk', 'sbi-po', 'sbi-clerk', 'rrb-ntpc'], chapters: {
    arithmetic: ['Arithmetic', { percentage: 'Percentage', 'profit-loss': 'Profit, loss & discount', interest: 'Simple interest', 'time-work': 'Time & work', averages: 'Averages & ratio' }],
  } },
  reasoning: { name: 'General Intelligence & Reasoning', exams: ['ssc-cgl', 'ssc-chsl', 'ssc-mts', 'ibps-po', 'ibps-clerk', 'sbi-po', 'sbi-clerk', 'rrb-ntpc'], chapters: {
    verbal: ['Verbal Reasoning', { series: 'Number series', coding: 'Coding–decoding', analogy: 'Analogy', direction: 'Direction sense' }],
  } },
  english: { name: 'English Language', exams: ['ssc-cgl', 'ssc-chsl', 'ibps-po', 'ibps-clerk', 'sbi-po', 'sbi-clerk'], chapters: {
    vocabulary: ['Vocabulary', { synonyms: 'Synonyms', antonyms: 'Antonyms' }],
    grammar: ['Grammar', { errors: 'Error spotting', blanks: 'Fill in the blanks' }],
  } },
  gs: { name: 'General Studies', exams: ['upsc-cse-prelims', 'upsc-cse-mains', 'ssc-cgl', 'ssc-chsl', 'rrb-ntpc', 'nda', 'cds'], chapters: {
    polity: ['Indian Polity', { constitution: 'Constitution', parliament: 'Parliament & constitutional bodies' }],
    history: ['Modern Indian History', { 'national-movement': 'National movement' }],
    geography: ['Indian Geography', { physiography: 'Physiography & rivers' }],
    economy: ['Indian Economy', { banking: 'Money & banking' }],
    science: ['General Science', { everyday: 'Everyday science' }],
  } },
};

// ---------------------------------------------------------------- pattern versions
// Subject references use syllabus keys (resolved to ids while seeding).
const jeeSection = (key, name, subject, numericCount) => ({
  key, name, selection: { subjectIds: [subject], difficultyMix: { easy: 0.3, medium: 0.5, hard: 0.2 } },
  composition: [{ type: 'mcq_single', count: 20 }, { type: 'numeric', count: numericCount }],
});
// 2024 format: Section B had 10 numerical questions of which any 5 could be answered.
const jee2024 = (key, name) => [
  { key: `${key}_a`, name: `${name} — Section A`, selection: { subjectIds: [key] }, composition: [{ type: 'mcq_single', count: 20 }] },
  { key: `${key}_b`, name: `${name} — Section B`, maxAttempted: 5, selection: { subjectIds: [key] }, composition: [{ type: 'numeric', count: 10 }] },
];

const JEE_INSTRUCTIONS = `1. The test contains three subjects: Physics, Chemistry and Mathematics.
2. Section A of each subject has multiple-choice questions with one correct option.
3. Section B of each subject has numerical-value questions. Enter the answer with the on-screen keypad.
4. Use **Save & Next** to save an answer. Selecting an option without saving does not record it.
5. The clock is set at the server. When time runs out the test is submitted automatically.`;

export const PATTERNS = [
  {
    exam: 'jee-main', stage: 'paper1', label: 'JEE Main Paper 1 — 2024 pattern', status: 'retired', effectiveFrom: '2024-01-01',
    config: {
      durationSec: 3 * 3600, languages: ['en', 'hi'], navigation: { mode: 'free' }, calculator: 'none',
      instructions: 'Section B: 10 numerical questions per subject, of which any 5 may be answered.',
      review: { allowMarkForReview: true, evaluateAnsweredMarked: true }, result: { showSolutions: 'after_submit', showRank: true },
      marking: { mcq_single: { correct: 4, incorrect: -1 }, numeric: { correct: 4, incorrect: -1 } },
      sections: [...jee2024('physics', 'Physics'), ...jee2024('chemistry', 'Chemistry'), ...jee2024('mathematics', 'Mathematics')],
    },
  },
  {
    exam: 'jee-main', stage: 'paper1', label: 'JEE Main Paper 1 — 2026 pattern', status: 'published', effectiveFrom: '2025-01-01',
    config: {
      durationSec: 3 * 3600, languages: ['en', 'hi'], navigation: { mode: 'free' }, calculator: 'none', instructions: JEE_INSTRUCTIONS,
      review: { allowMarkForReview: true, evaluateAnsweredMarked: true }, result: { showSolutions: 'after_submit', showRank: true },
      marking: { mcq_single: { correct: 4, incorrect: -1 }, numeric: { correct: 4, incorrect: -1 } },
      sections: [
        jeeSection('physics', 'Physics', 'physics', 5),
        jeeSection('chemistry', 'Chemistry', 'chemistry', 5),
        jeeSection('mathematics', 'Mathematics', 'mathematics', 5),
      ],
    },
  },
  {
    exam: 'jee-main', stage: 'practice', label: 'Mini mock — 2026 marking, 15 questions', status: 'published',
    config: {
      durationSec: 36 * 60, languages: ['en', 'hi'], navigation: { mode: 'free' }, calculator: 'none', instructions: JEE_INSTRUCTIONS,
      review: { allowMarkForReview: true, evaluateAnsweredMarked: true }, result: { showSolutions: 'after_submit', showRank: true },
      marking: { mcq_single: { correct: 4, incorrect: -1 }, numeric: { correct: 4, incorrect: -1 } },
      sections: ['physics', 'chemistry', 'mathematics'].map((s) => ({
        key: s, name: s[0].toUpperCase() + s.slice(1), selection: { subjectIds: [s] },
        composition: [{ type: 'mcq_single', count: 4 }, { type: 'numeric', count: 1 }],
      })),
    },
  },
  {
    exam: 'jee-advanced', stage: 'practice', label: 'Multi-correct drill — partial marking', status: 'published',
    config: {
      durationSec: 30 * 60, languages: ['en'], navigation: { mode: 'free' }, calculator: 'none',
      instructions: `**Multiple-correct questions:** one or more options are correct.
- +4 if only all correct options are chosen
- +1 for each correct option chosen when not all correct options are chosen and no wrong option is chosen
- −2 if any wrong option is chosen; 0 if unanswered

**Numerical questions:** +4 if correct, 0 otherwise.`,
      review: { allowMarkForReview: true, evaluateAnsweredMarked: true }, result: { showSolutions: 'after_submit', showRank: true },
      marking: {
        mcq_multi: { correct: 4, incorrect: -2, partial: { perCorrectOption: 1 } },
        numeric: { correct: 4, incorrect: 0 },
      },
      sections: [
        { key: 'physics', name: 'Physics', selection: { subjectIds: ['physics'] }, composition: [{ type: 'mcq_multi', count: 1 }, { type: 'numeric', count: 1 }] },
        { key: 'mathematics', name: 'Mathematics', selection: { subjectIds: ['mathematics'] }, composition: [{ type: 'mcq_multi', count: 3 }, { type: 'numeric', count: 2 }] },
      ],
    },
  },
  {
    exam: 'neet-ug', stage: 'main', label: 'NEET (UG) — 2025 pattern', status: 'published', effectiveFrom: '2025-01-01',
    config: {
      durationSec: 180 * 60, languages: ['en', 'hi'], navigation: { mode: 'free' }, calculator: 'none',
      instructions: '180 compulsory questions. +4 for each correct answer, −1 for each incorrect answer, 0 if unanswered.',
      review: { allowMarkForReview: true, evaluateAnsweredMarked: true }, result: { showSolutions: 'after_submit', showRank: true },
      marking: { mcq_single: { correct: 4, incorrect: -1 } },
      sections: [
        { key: 'physics', name: 'Physics', selection: { subjectIds: ['physics'] }, composition: [{ type: 'mcq_single', count: 45 }] },
        { key: 'chemistry', name: 'Chemistry', selection: { subjectIds: ['chemistry'] }, composition: [{ type: 'mcq_single', count: 45 }] },
        { key: 'biology', name: 'Biology', selection: { subjectIds: ['biology'] }, composition: [{ type: 'mcq_single', count: 90 }] },
      ],
    },
  },
  {
    exam: 'neet-ug', stage: 'practice', label: 'Mini mock — NEET marking, 14 questions', status: 'published',
    config: {
      durationSec: 30 * 60, languages: ['en'], navigation: { mode: 'free' }, calculator: 'none',
      instructions: '+4 for each correct answer, −1 for each incorrect answer, 0 if unanswered.',
      review: { allowMarkForReview: true, evaluateAnsweredMarked: true }, result: { showSolutions: 'after_submit', showRank: true },
      marking: { mcq_single: { correct: 4, incorrect: -1 } },
      sections: [
        { key: 'physics', name: 'Physics', selection: { subjectIds: ['physics'] }, composition: [{ type: 'mcq_single', count: 4 }] },
        { key: 'chemistry', name: 'Chemistry', selection: { subjectIds: ['chemistry'] }, composition: [{ type: 'mcq_single', count: 4 }] },
        { key: 'biology', name: 'Biology', selection: { subjectIds: ['biology'] }, composition: [{ type: 'mcq_single', count: 6 }] },
      ],
    },
  },
  {
    exam: 'ssc-cgl', stage: 'tier1', label: 'SSC CGL Tier 1 — 2025 pattern', status: 'published', effectiveFrom: '2025-01-01',
    config: {
      durationSec: 60 * 60, languages: ['en', 'hi'], navigation: { mode: 'free' }, calculator: 'none',
      instructions: '100 questions, 2 marks each. 0.50 marks are deducted for each wrong answer.',
      review: { allowMarkForReview: true, evaluateAnsweredMarked: true }, result: { showSolutions: 'after_submit', showRank: true },
      marking: { mcq_single: { correct: 2, incorrect: -0.5 } },
      sections: [
        { key: 'reasoning', name: 'General Intelligence & Reasoning', selection: { subjectIds: ['reasoning'] }, composition: [{ type: 'mcq_single', count: 25 }] },
        { key: 'ga', name: 'General Awareness', selection: { subjectIds: ['gs'] }, composition: [{ type: 'mcq_single', count: 25 }] },
        { key: 'quant', name: 'Quantitative Aptitude', selection: { subjectIds: ['quant'] }, composition: [{ type: 'mcq_single', count: 25 }] },
        { key: 'english', name: 'English Comprehension', selection: { subjectIds: ['english'] }, composition: [{ type: 'mcq_single', count: 25 }] },
      ],
    },
  },
  {
    exam: 'ssc-cgl', stage: 'practice', label: 'Mini mock — SSC marking, 16 questions', status: 'published',
    config: {
      durationSec: 16 * 60, languages: ['en', 'hi'], navigation: { mode: 'free' }, calculator: 'none',
      instructions: '2 marks for each correct answer, 0.50 deducted for each wrong answer.',
      review: { allowMarkForReview: true, evaluateAnsweredMarked: true }, result: { showSolutions: 'after_submit', showRank: true },
      marking: { mcq_single: { correct: 2, incorrect: -0.5 } },
      sections: [
        { key: 'reasoning', name: 'Reasoning', selection: { subjectIds: ['reasoning'] }, composition: [{ type: 'mcq_single', count: 4 }] },
        { key: 'ga', name: 'General Awareness', selection: { subjectIds: ['gs'] }, composition: [{ type: 'mcq_single', count: 4 }] },
        { key: 'quant', name: 'Quantitative Aptitude', selection: { subjectIds: ['quant'] }, composition: [{ type: 'mcq_single', count: 4 }] },
        { key: 'english', name: 'English', selection: { subjectIds: ['english'] }, composition: [{ type: 'mcq_single', count: 4 }] },
      ],
    },
  },
  {
    exam: 'ssc-cgl', stage: 'practice', label: 'Sectional-timed drill — locked sections', status: 'published',
    config: {
      durationSec: 12 * 60, languages: ['en', 'hi'], navigation: { mode: 'sequential', allowEarlySectionExit: true }, calculator: 'none',
      instructions: 'Each section has its own 3-minute timer. When a section ends you move to the next and cannot return.',
      review: { allowMarkForReview: true, evaluateAnsweredMarked: true }, result: { showSolutions: 'after_submit', showRank: true },
      marking: { mcq_single: { correct: 2, incorrect: -0.5 } },
      sections: [
        { key: 'quant', name: 'Quantitative Aptitude', durationSec: 180, selection: { subjectIds: ['quant'] }, composition: [{ type: 'mcq_single', count: 3 }] },
        { key: 'reasoning', name: 'Reasoning', durationSec: 180, selection: { subjectIds: ['reasoning'] }, composition: [{ type: 'mcq_single', count: 3 }] },
        { key: 'english', name: 'English', durationSec: 180, selection: { subjectIds: ['english'] }, composition: [{ type: 'mcq_single', count: 3 }] },
        { key: 'ga', name: 'General Awareness', durationSec: 180, selection: { subjectIds: ['gs'] }, composition: [{ type: 'mcq_single', count: 3 }] },
      ],
    },
  },
  {
    exam: 'ibps-po', stage: 'prelims', label: 'IBPS PO Prelims — sectional timing', status: 'published',
    config: {
      durationSec: 60 * 60, languages: ['en', 'hi'], navigation: { mode: 'sequential', allowEarlySectionExit: false }, calculator: 'none',
      instructions: 'Three sections with 20 minutes each. Sections are locked once their time ends. 0.25 of the marks of a question is deducted for a wrong answer.',
      review: { allowMarkForReview: true, evaluateAnsweredMarked: true }, result: { showSolutions: 'after_submit', showRank: true },
      marking: { mcq_single: { correct: 1, incorrect: -0.25 } },
      sections: [
        { key: 'english', name: 'English Language', durationSec: 1200, selection: { subjectIds: ['english'] }, composition: [{ type: 'mcq_single', count: 30 }] },
        { key: 'quant', name: 'Quantitative Aptitude', durationSec: 1200, selection: { subjectIds: ['quant'] }, composition: [{ type: 'mcq_single', count: 35 }] },
        { key: 'reasoning', name: 'Reasoning Ability', durationSec: 1200, selection: { subjectIds: ['reasoning'] }, composition: [{ type: 'mcq_single', count: 35 }] },
      ],
    },
  },
  {
    exam: 'upsc-cse-prelims', stage: 'gs1', label: 'GS Paper I — current pattern', status: 'published',
    config: {
      durationSec: 120 * 60, languages: ['en', 'hi'], navigation: { mode: 'free' }, calculator: 'none',
      instructions: '100 questions of 2 marks each. One-third of the marks of a question (0.66) is deducted for each wrong answer.',
      review: { allowMarkForReview: true, evaluateAnsweredMarked: true }, result: { showSolutions: 'after_submit', showRank: true },
      marking: { mcq_single: { correct: 2, incorrect: -0.66 } },
      sections: [{ key: 'gs', name: 'General Studies', selection: { subjectIds: ['gs'] }, composition: [{ type: 'mcq_single', count: 100 }] }],
    },
  },
  {
    exam: 'upsc-cse-prelims', stage: 'practice', label: 'Mini mock — 10 questions, UPSC marking', status: 'published',
    config: {
      durationSec: 12 * 60, languages: ['en', 'hi'], navigation: { mode: 'free' }, calculator: 'none',
      instructions: '2 marks for each correct answer; 0.66 deducted for each wrong answer.',
      review: { allowMarkForReview: true, evaluateAnsweredMarked: true }, result: { showSolutions: 'after_submit', showRank: true },
      marking: { mcq_single: { correct: 2, incorrect: -0.66 } },
      sections: [{ key: 'gs', name: 'General Studies', selection: { subjectIds: ['gs'] }, composition: [{ type: 'mcq_single', count: 10 }] }],
    },
  },
  {
    exam: 'upsc-cse-mains', stage: 'practice', label: 'Answer-writing practice — 2 questions', status: 'published',
    config: {
      durationSec: 20 * 60, languages: ['en'], navigation: { mode: 'free' }, calculator: 'none',
      instructions: 'Write within the word limit. A mentor will evaluate your answers and add feedback.',
      review: { allowMarkForReview: true }, result: { showSolutions: 'after_submit', showRank: false },
      marking: { descriptive: { correct: 10 } },
      sections: [{ key: 'gs2', name: 'General Studies II', selection: { subjectIds: ['gs'] }, composition: [{ type: 'descriptive', count: 2 }] }],
    },
  },
];

export const MOCK_TESTS = [
  { exam: 'jee-main', patternLabel: 'Mini mock — 2026 marking, 15 questions', title: 'JEE Main Mini Mock 1', kind: 'practice', seed: 'jee-mini-1' },
  { exam: 'jee-advanced', patternLabel: 'Multi-correct drill — partial marking', title: 'JEE Advanced Multi-correct Drill', kind: 'practice', seed: 'adv-1' },
  { exam: 'neet-ug', patternLabel: 'Mini mock — NEET marking, 14 questions', title: 'NEET Mini Mock 1', kind: 'practice', seed: 'neet-mini-1' },
  { exam: 'ssc-cgl', patternLabel: 'Mini mock — SSC marking, 16 questions', title: 'SSC CGL Mini Mock 1', kind: 'practice', seed: 'ssc-mini-1' },
  { exam: 'ssc-cgl', patternLabel: 'Sectional-timed drill — locked sections', title: 'SSC CGL Sectional-timed Drill', kind: 'sectional', seed: 'ssc-sect-1' },
  { exam: 'upsc-cse-prelims', patternLabel: 'Mini mock — 10 questions, UPSC marking', title: 'UPSC Prelims GS Mini Mock 1', kind: 'practice', seed: 'upsc-mini-1' },
  { exam: 'upsc-cse-mains', patternLabel: 'Answer-writing practice — 2 questions', title: 'GS II Answer-writing Practice', kind: 'practice', seed: 'mains-1' },
];
