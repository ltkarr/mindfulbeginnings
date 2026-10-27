const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../js/ref-capture');

function fakeStore() {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); }
  };
}

const NOW = Date.UTC(2026, 9, 27, 12, 0, 0);

test('known slugs map to the liaison names', () => {
  assert.equal(api.sourceForSlug('mary-parks'), 'Mary Parks');
  assert.equal(api.sourceForSlug('katy-greenberg'), 'Katy Greenberg');
  assert.equal(api.sourceForSlug('Mary-Parks'), 'Mary Parks');
  assert.equal(api.sourceForSlug('someone-else'), '');
  assert.equal(api.sourceForSlug(''), '');
});

test('landing with a ref link stores that person', () => {
  const store = fakeStore();
  assert.equal(api.captureFromUrl('?ref=mary-parks', store, NOW), 'Mary Parks');
  assert.equal(api.storedSource(store, NOW), 'Mary Parks');
});

test('a later link replaces an earlier one (last touch wins)', () => {
  const store = fakeStore();
  api.captureFromUrl('?ref=mary-parks', store, NOW);
  api.captureFromUrl('?ref=katy-greenberg', store, NOW + 1000);
  assert.equal(api.storedSource(store, NOW + 1000), 'Katy Greenberg');
});

test('no ref param leaves any stored referral untouched', () => {
  const store = fakeStore();
  api.captureFromUrl('?ref=mary-parks', store, NOW);
  assert.equal(api.captureFromUrl('?utm_source=sign', store, NOW + 1000), '');
  assert.equal(api.storedSource(store, NOW + 1000), 'Mary Parks');
});

test('stored referral expires after 90 days', () => {
  const store = fakeStore();
  api.captureFromUrl('?ref=katy-greenberg', store, NOW);
  assert.equal(api.storedSource(store, NOW + 89 * 24 * 3600 * 1000), 'Katy Greenberg');
  assert.equal(api.storedSource(store, NOW + 91 * 24 * 3600 * 1000), '');
});

test('prefill sets an empty select that offers the source', () => {
  const sel = {
    value: '',
    options: [
      { value: '', text: 'Select one...' },
      { value: 'Mary Parks', text: 'Mary Parks' },
      { value: 'Katy Greenberg', text: 'Katy Greenberg' }
    ]
  };
  const doc = { getElementById: (id) => (id === 'p-referral' ? sel : null) };
  assert.equal(api.prefillSelect(doc, 'Katy Greenberg'), true);
  assert.equal(sel.value, 'Katy Greenberg');
});

test('prefill never overrides a value the visitor already chose', () => {
  const sel = {
    value: 'Nextdoor',
    options: [
      { value: 'Nextdoor', text: 'Nextdoor' },
      { value: 'Mary Parks', text: 'Mary Parks' }
    ]
  };
  const doc = { getElementById: (id) => (id === 'referral' ? sel : null) };
  assert.equal(api.prefillSelect(doc, 'Mary Parks'), false);
  assert.equal(sel.value, 'Nextdoor');
});
