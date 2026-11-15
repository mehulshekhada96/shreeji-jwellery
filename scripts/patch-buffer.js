import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const target = path.join(__dirname, '..', 'node_modules', 'buffer-equal-constant-time', 'index.js');
if (fs.existsSync(target)) {
  let content = fs.readFileSync(target, 'utf8');
  if (content.includes('var origSlowBufEqual = SlowBuffer.prototype.equal;')) {
    content = content.replace(
      'var origSlowBufEqual = SlowBuffer.prototype.equal;',
      'var origSlowBufEqual = typeof SlowBuffer !== "undefined" && SlowBuffer && SlowBuffer.prototype ? SlowBuffer.prototype.equal : undefined;'
    );
    content = content.replace(
      'SlowBuffer.prototype.equal = origSlowBufEqual;',
      'if (typeof SlowBuffer !== "undefined" && SlowBuffer && SlowBuffer.prototype) { SlowBuffer.prototype.equal = origSlowBufEqual; }'
    );
    content = content.replace(
      'Buffer.prototype.equal = SlowBuffer.prototype.equal = function equal(that) {',
      'Buffer.prototype.equal = function equal(that) { return bufferEq(this, that); }; if (typeof SlowBuffer !== "undefined" && SlowBuffer && SlowBuffer.prototype) { SlowBuffer.prototype.equal = function equal(that) {'
    );
    fs.writeFileSync(target, content, 'utf8');
    console.log('✅ Patched buffer-equal-constant-time for Node.js compatibility');
  }
}
