const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('VERSION starts semantic version tracking at 1.0.0', () => {
  const version = read('VERSION').trim();

  assert.equal(version, '1.0.0');
  assert.match(version, /^[0-9]+\.[0-9]+\.[0-9]+$/);
});

test('manifest version follows VERSION', () => {
  const version = read('VERSION').trim();
  const manifest = JSON.parse(read('manifest.json'));

  assert.equal(manifest.version, version);
});

test('package script creates one versioned Chrome extension zip', () => {
  const script = read('package.sh');

  assert.match(script, /VERSION_FILE=.*VERSION/);
  assert.match(script, /ZIP_PATH=.*\$\{APP_NAME\}-\$\{VERSION\}-chrome-extension\.zip/);
  assert.match(script, /manifest\.json/);
  assert.match(script, /newtab\.html/);
  assert.doesNotMatch(script, /\.sha256/);
});

test('release script creates signed semver tag and uploads one package asset', () => {
  const script = read('release.sh');

  assert.match(script, /TAG_NAME="v\$\{VERSION\}"/);
  assert.match(script, /git tag -s "\$\{TAG_NAME\}"/);
  assert.match(script, /git tag -v "\$\{TAG_NAME\}"/);
  assert.match(script, /generate_release_notes/);
  assert.match(script, /upload_asset "\$\{ZIP_PATH\}" "application\/zip"/);
  assert.doesNotMatch(script, /SHA_PATH/);
});
