import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../native/src/PluginProcessor.cpp',import.meta.url),'utf8');
assert.doesNotMatch(src,/inputFifo_\.write\(1\)\.startIndex1/);
assert.match(src,/auto scope = inputFifo_\.write\(1\);/);
assert.match(src,/scope\.blockSize1 > 0/);
assert.match(src,/droppedInput_/);
console.log('MIDItest native source contracts: PASS');
