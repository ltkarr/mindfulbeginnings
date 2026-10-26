'use strict';

/*
  Catalog price for one session. Reads the price JSON embedded in
  migrations/20261026_payment_auto_match.sql. Same rules as getSessionBasePrice
  in config.js: a later price change applies only when the session was created
  on or after that change, and a stored session price is never an input here.
  Returns null when the course has no list price (unknown course, or a custom
  quote with no default).
*/

function courseNames(catalog, course) {
  const name = String(course || '');
  const names = [name];
  const aliases = catalog.aliases || {};
  if (aliases[name] && names.indexOf(aliases[name]) < 0) names.push(aliases[name]);
  Object.keys(aliases).forEach(function (oldName) {
    if (aliases[oldName] === name && names.indexOf(oldName) < 0) names.push(oldName);
  });
  return names;
}

function createdMs(createdAt) {
  if (createdAt == null || createdAt === '') return null;
  if (typeof createdAt === 'number') return Number.isFinite(createdAt) ? createdAt : null;
  const t = Date.parse(String(createdAt));
  return Number.isNaN(t) ? null : t;
}

function firstNumber(row, keys) {
  for (let i = 0; i < keys.length; i++) {
    if (row[keys[i]] != null) return row[keys[i]];
  }
  return null;
}

function sessionListPrice(catalog, course, dateStr, createdAt) {
  const names = courseNames(catalog, course);
  let row = null;
  for (let i = 0; i < names.length; i++) {
    if (catalog.courses && catalog.courses[names[i]]) {
      row = catalog.courses[names[i]];
      break;
    }
  }
  if (!row) return null;

  const created = createdMs(createdAt);
  const customFrom = Date.parse(catalog.customQuoteFrom);
  if (row.customPrice && created != null && created >= customFrom) return null;

  if (created != null) {
    const later = catalog.later || [];
    for (let i = 0; i < later.length; i++) {
      if (created < Date.parse(later[i].from)) continue;
      const prices = later[i].prices || {};
      for (let n = 0; n < names.length; n++) {
        if (prices[names[n]] != null) return prices[names[n]];
      }
    }
  }

  if (row.customPrice) return row.legacyPrice != null ? row.legacyPrice : null;

  const year = dateStr ? parseInt(String(dateStr).split('-')[0], 10) : new Date().getFullYear();
  const isNew = created != null && created >= Date.parse(catalog.newPricingEffective);
  if (isNew) {
    if (year >= 2027) return firstNumber(row, ['priceNew2027', 'priceNew', 'price2027', 'price']);
    return firstNumber(row, ['priceNew', 'price']);
  }
  if (year >= 2027) return firstNumber(row, ['price2027', 'price']);
  return row.price != null ? row.price : null;
}

function catalogFromMigration(sql) {
  const start = sql.indexOf('$mbprice$');
  const end = sql.indexOf('$mbprice$', start + 9);
  if (start < 0 || end < 0) throw new Error('price catalog markers missing');
  return JSON.parse(sql.slice(start + '$mbprice$'.length, end));
}

module.exports = {
  courseNames,
  sessionListPrice,
  catalogFromMigration
};
