// site-access-policy-alignment.test.js
// Verify that code default site lists align with SITE_ACCESS_POLICY.md

'use strict';

const fs = require('fs');
const path = require('path');

const defaultsPath = path.join(__dirname, '..', '..', 'workers', 'config', 'site-access-defaults.json');
const defaults = JSON.parse(fs.readFileSync(defaultsPath, 'utf8'));

let passed = 0;
let failed = 0;

function check(desc, condition) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${desc}`);
  } else {
    failed++;
    console.error(`  ✗ ${desc}`);
  }
}

// ── All default study sites listed in SITE_ACCESS_POLICY.md §8 ──
const policyStudySites = [
  // §8.1 School / LMS / Classroom Infrastructure (10)
  'classroom.google.com', 'managebac.com', 'kognity.com', 'instructure.com',
  'blackboard.com', 'moodle.org', 'schoology.com', 'powerschool.com',
  'clever.com', 'turnitin.com',

  // §8.2 Workspace / Documents / Assignments (16)
  'drive.google.com', 'docs.google.com', 'sheets.google.com', 'slides.google.com',
  'forms.google.com', 'meet.google.com', 'calendar.google.com', 'keep.google.com',
  'colab.research.google.com', 'office.com', 'onedrive.live.com', 'onenote.com',
  'outlook.live.com', 'planner.microsoft.com', 'to-do.office.com', 'teams.microsoft.com',

  // §8.3 AI / Research Assistance (13)
  'chatgpt.com', 'openai.com', 'claude.ai', 'gemini.google.com',
  'copilot.microsoft.com', 'poe.com', 'perplexity.ai', 'notebooklm.google.com',
  'elicit.org', 'consensus.app', 'scite.ai', 'wolframalpha.com', 'phind.com',

  // §8.4 Writing / Citation / Grammar (15)
  'grammarly.com', 'quillbot.com', 'overleaf.com', 'zotero.org', 'mendeley.com',
  'owl.purdue.edu', 'citationmachine.net', 'easybib.com', 'bibme.org',
  'scribbr.com', 'languagetool.org', 'hemingwayapp.com', 'noredink.com',
  'membean.com', 'achieve3000.com',

  // §8.5 Curriculum / Exam Systems (5)
  'ibo.org', 'collegeboard.org', 'apclassroom.collegeboard.org',
  'bluebook.app.collegeboard.org', 'act.org',

  // §8.6 Curriculum Resource Sites (12)
  'revisionvillage.com', 'savemyexams.com', 'physicsandmathstutor.com', 'albert.io',
  'fiveable.me', 'bioninja.com.au', 'theoryofknowledge.net', 'ibdocuments.com',
  'ibsurvival.com', 'lanterna.com', 'pastpapers.co', 'crackap.com',

  // §8.7 Online Learning Platforms (13)
  'khanacademy.org', 'ocw.mit.edu', 'coursera.org', 'edx.org', 'brilliant.org',
  'udemy.com', 'futurelearn.com', 'udacity.com', 'codecademy.com', 'datacamp.com',
  'freecodecamp.org', 'openstax.org', 'ck12.org',

  // §8.8 Math / Science / STEM Tools (12)
  'desmos.com', 'geogebra.org', 'symbolab.com', 'mathway.com',
  'physicsclassroom.com', 'phet.colorado.edu', 'falstad.com', 'myphysicslab.com',
  'logic.ly', 'mathsisfun.com', 'artofproblemsolving.com', 'aops.com',

  // §8.9 Coding / Engineering / Maker Tools (12)
  'github.com', 'leetcode.com', 'hackerrank.com', 'codingbat.com', 'replit.com',
  'codepen.io', 'developer.mozilla.org', 'w3schools.com', 'tinkercad.com',
  'arduino.cc', 'raspberrypi.com', 'instructables.com',

  // §8.10 Academic Sources / Libraries (16)
  'arxiv.org', 'scholar.google.com', 'jstor.org', 'researchgate.net',
  'semanticscholar.org', 'pubmed.ncbi.nlm.nih.gov', 'ncbi.nlm.nih.gov',
  'gutenberg.org', 'plato.stanford.edu', 'nature.com', 'science.org',
  'springer.com', 'sciencedirect.com', 'cambridge.org', 'oup.com',
  'archive.org', 'loc.gov',

  // §8.11 Creative / Presentation / Project Tools (12)
  'canva.com', 'figma.com', 'photopea.com', 'pixlr.com', 'gamma.app',
  'prezi.com', 'miro.com', 'lucidchart.com', 'draw.io', 'diagrams.net',
  'quizizz.com', 'kahoot.it',

  // §8.12 Notes / Planning / Productivity / Collaboration (6)
  'notion.so', 'obsidian.md', 'ankiweb.net', 'trello.com', 'slack.com', 'reclaim.ai',
];

const studySet = new Set(defaults.defaultStudySites.map(d => d.toLowerCase()));

console.log('\n── Policy defaultStudySites alignment ──');
for (const domain of policyStudySites) {
  check(`${domain} in defaultStudySites`, studySet.has(domain.toLowerCase()));
}

// ── Software/Vendor Support Sites in defaultCompositeSites ──
const vendorSupportDomains = [
  'microsoft.com',
  'apple.com',
  'adobe.com',
];

const compositeSet = new Set(defaults.defaultCompositeSites.map(d => d.toLowerCase()));

console.log('\n── Vendor/Support composite sites ──');
for (const domain of vendorSupportDomains) {
  check(`${domain} in defaultCompositeSites`, compositeSet.has(domain.toLowerCase()));
}

// ── Removed sites should NOT be in defaultCompositeSites ──
const removedCompositeDomains = [
  'baidu.com',
  'duckduckgo.com',
  'search.brave.com',
  'baike.baidu.com',
];

console.log('\n── Removed sites NOT in defaultCompositeSites ──');
for (const domain of removedCompositeDomains) {
  check(`${domain} NOT in defaultCompositeSites`, !compositeSet.has(domain.toLowerCase()));
}

// ── defaultUserCompositeSites ──
const userCompositeDomains = [
  'wikipedia.org',
  'wikimedia.org',
  'stackexchange.com',
  'reddit.com',
];

const userCompositeSet = new Set((defaults.defaultUserCompositeSites || []).map(d => d.toLowerCase()));

console.log('\n── User-default composite sites ──');
for (const domain of userCompositeDomains) {
  check(`${domain} in defaultUserCompositeSites`, userCompositeSet.has(domain.toLowerCase()));
}

check('britannica.com stays study-only, not user composite', !userCompositeSet.has('britannica.com'));
check('stackoverflow.com stays study-only, not user composite', !userCompositeSet.has('stackoverflow.com'));
const restrictedSet = new Set((defaults.defaultRestrictedEntertainmentSites || []).map(d => d.toLowerCase()));
check('youtube.com is restricted entertainment root, not user composite', restrictedSet.has('youtube.com') && !userCompositeSet.has('youtube.com'));
check('defaultUserCompositeSites count = 4', (defaults.defaultUserCompositeSites || []).length === 4);

// ── Summary ──
const total = passed + failed;
console.log(`\n[Site Access Policy Alignment] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
if (failed > 0) process.exit(1);
