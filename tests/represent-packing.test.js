'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const rep = require('../js/represent-packing.js');

const RAPHAEL = 'Please pickup materials (giveaways, signs) before the event. Represent us at the event - tell people about our courses! Encourage everyone to host a Safe Sitter course for their middle schoolers!';
const DARNESTOWN = 'Set up by 2 PM. Share classes, hand out giveaways, and capture emails or point people to registration. Bring a 6-ft folding table (the instructor brings their own; it must fit in the car), a navy tablecloth, the MB banner, giveaways, flyers or a QR registration sign, pens, and business cards. Pick up the tablecloth, banner, giveaways, and signup materials from storage. Wear an MB shirt or sweatshirt and a badge. Return leftovers. Send a quick report.';
const THES = 'Vendor setup 9:30-11 AM, market 11 AM-3 PM, cleanup 3-4 PM. Arrive at 9:30 AM. Vendors bring tables and chairs. Pick up our folding table, tablecloth, banner, signage, and giveaways from storage. Wear an MB shirt or sweatshirt and a badge. Share all classes and point people to registration. Return leftovers.';
const GMU = 'Health and safety information only. No food or candy. Do not use the GMU name or logo on signage. Pick up the tablecloth, banner, giveaways (first aid kits, pens, postcards), and signage. Wear an MB shirt or sweatshirt and a badge. Arrive at 9 AM, set up by 9:45, and pack by 3 PM. Door code 9999. Parking is $20.';

function items(model, title) {
  const sec = model.sections.filter(function (s) { return s.title === title; })[0];
  return sec ? sec.items.map(function (item) { return rep.itemText(item); }).join(' | ') : '';
}

test('representation events are recognized and teaching jobs are not', () => {
  assert.equal(rep.isRepresentSession({ code: 'RUA-261119', course: 'Represent us at St. Raphael', isVirtual: false }), true);
  assert.equal(rep.isRepresentSession({ code: 'THE-261121', course: 'Represent us at THES PTA Holiday Market', isVirtual: false }), true);
  assert.equal(rep.isRepresentSession({ code: 'RUA-1', course: 'Represent us', isVirtual: true }), false);
  assert.equal(rep.isRepresentSession({ code: 'SS-1', course: 'Safe Sitter®', isCustomJob: false }), false);
  assert.equal(rep.isRepresentSession({ code: 'CR-1', course: 'Care Ready at a workplace', isCustomJob: true }), false);
});

test('a sparse represent event packs only what the notes name and labels suggestions', () => {
  const model = rep.build({ code: 'RUA-261119', course: "Represent us at St. Raphael School's Girls Night Out!", notes: RAPHAEL });
  const pack = items(model, 'Pack from storage');
  assert.match(pack, /Giveaways: quantity needs confirmation/);
  assert.match(pack, /Signs: quantity needs confirmation/);
  assert.doesNotMatch(pack, /manikin|AV kit|tablecloth|Folding table/i);
  const suggest = items(model, 'Suggestions, not in the notes');
  assert.match(suggest, /Safe Sitter hosting note/);
  assert.match(suggest, /Business cards/);
  assert.match(suggest, /QR code/);
  assert.match(suggest, /Pens/);
  assert.match(items(model, 'Confirm before you pack'), /table and tablecloth are not in the notes/i);
  assert.match(items(model, 'At the event'), /Safe Sitter course/);
  const html = rep.printHtml(model, { instructor: 'Kim Varner', date: 'Thursday, November 19, 2026', time: '6:30-8:30pm', place: 'St. Raphael School, 1513 Dunster Road, Rockville, MD 20854', code: 'RUA-261119' });
  assert.match(html, /Materials packing list/);
  assert.match(html, /Kim Varner/);
  assert.match(html, /RUA-261119/);
  assert.match(html, /1513 Dunster Road/);
  assert.match(html, /Suggestions, not in the notes/);
  assert.match(html, /quantity needs confirmation/);
  const sum = rep.summary(model);
  assert.match(sum.confirm, /Giveaways: quantity needs confirmation/);
  assert.doesNotMatch(sum.packNow, /Giveaways/);
  assert.doesNotMatch(html, /—|–/);
});

test('Darnestown table is the instructor\'s and THES table is packed from storage', () => {
  const darn = rep.build({ code: 'RUA-261121', course: 'Represent us at Darnestown Presbyterian Church', notes: DARNESTOWN });
  assert.match(items(darn, 'Instructor brings (do not pack)'), /instructor's own/);
  assert.doesNotMatch(items(darn, 'Pack from storage'), /Folding table|folding table/i);
  assert.match(items(darn, 'Pack from storage'), /1 Navy tablecloth/);
  assert.match(items(darn, 'Pack from storage'), /1 Mindful Beginnings banner/);
  assert.match(items(darn, 'Pack from storage'), /Giveaways: quantity needs confirmation/);
  assert.match(items(darn, 'Pack from storage'), /banner/);
  assert.match(items(darn, 'Pack from storage'), /Giveaways/);
  assert.match(items(darn, 'Pack from storage'), /Pens/);
  assert.match(items(darn, 'Pack from storage'), /Business cards/);
  const thes = rep.build({ code: 'THE-261121', course: 'Represent us at THES PTA Holiday Market', notes: THES });
  assert.match(items(thes, 'Pack from storage'), /1 Our folding table/);
  assert.match(items(thes, 'At the event, not from our storage'), /Chairs/);
  assert.doesNotMatch(items(thes, 'Instructor brings (do not pack)'), /table/i);
  const html = rep.printHtml(thes, { instructor: '', date: '2026-11-21', place: 'THES', code: 'THE-261121' });
  assert.match(html, /Instructor: Unassigned/);
});

test('GMU restrictions are kept and food, pay, and lock codes are not packed', () => {
  const model = rep.build({ code: 'RUA-270325', course: 'Represent us at GMU Health & Fitness Expo 2027', notes: GMU });
  const html = rep.printHtml(model, { instructor: 'Jennie Stroup', code: 'RUA-270325' });
  assert.match(items(model, 'Do not'), /No food or candy/);
  assert.match(items(model, 'Do not'), /logo/);
  assert.match(items(model, 'Pack from storage'), /First aid kits/);
  assert.match(items(model, 'Pack from storage'), /Postcards/);
  assert.doesNotMatch(html, /9999|\$20|Parking/);
  assert.doesNotMatch(items(model, 'Suggestions, not in the notes'), /food|candy/i);
});

test('notes are escaped and a virtual booth is not listed', () => {
  const model = rep.build({ code: 'RUA-1', course: 'Represent us <script>', notes: 'Pick up giveaways.' });
  const html = rep.printHtml(model, { instructor: '<Ann>', place: '<b>' });
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;Ann&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.equal(rep.build({ code: 'RUA-1', course: 'Represent us', isVirtual: true, notes: 'Pick up giveaways.' }), null);
});
