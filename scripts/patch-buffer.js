import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const target = path.join(__dirname, '..', 'node_modules', 'buffer-equal-constant-time', 'index.js');

if (fs.existsSync(target)) {
  const cleanContent = `/*jshint node:true */
'use strict';
var Buffer = require('buffer').Buffer;
var SlowBuffer = require('buffer').SlowBuffer;

module.exports = bufferEq;

function bufferEq(a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  var c = 0;
  for (var i = 0; i < a.length; i++) {
    c |= a[i] ^ b[i];
  }
  return c === 0;
}

bufferEq.install = function() {
  Buffer.prototype.equal = function equal(that) {
    return bufferEq(this, that);
  };
  if (typeof SlowBuffer !== 'undefined' && SlowBuffer && SlowBuffer.prototype) {
    SlowBuffer.prototype.equal = function equal(that) {
      return bufferEq(this, that);
    };
  }
};

var origBufEqual = Buffer.prototype.equal;
var origSlowBufEqual = typeof SlowBuffer !== 'undefined' && SlowBuffer && SlowBuffer.prototype ? SlowBuffer.prototype.equal : undefined;

bufferEq.restore = function() {
  Buffer.prototype.equal = origBufEqual;
  if (typeof SlowBuffer !== 'undefined' && SlowBuffer && SlowBuffer.prototype) {
    SlowBuffer.prototype.equal = origSlowBufEqual;
  }
};
`;

  fs.writeFileSync(target, cleanContent, 'utf8');
  console.log('✅ Successfully wrote clean buffer-equal-constant-time patch!');
}
