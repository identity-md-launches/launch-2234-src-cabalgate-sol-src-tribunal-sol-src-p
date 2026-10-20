/* PLEA text checks: the contract's rules, in the browser.
 *
 * Mirrors khaed1/plea (branch next):
 *   CabalGate._validateText / _refused / _checkMarker  (plea and appeal text; BadPleaText)
 *   Tribunal._validateText (the same rules for objection text; BadObjectionText)
 *   Letterbox._read / _isWord / _after / _checkName / _checkLength  (letters, NAME, LetterTooLong)
 * A text the contract accepts must pass here, and a text it refuses must fail here, with the reason
 * in plain words. The byte count is the UTF-8 byte count the contract sees (TextEncoder, as viem
 * encodes a string argument). Every rule is applied to those bytes, exactly as the contract does.
 * Differential test against the Solidity: tools/difftest/run.mjs.
 *
 * Use: PleaText.checkText(s), PleaText.checkObjection(s), PleaText.checkLetter(s),
 * PleaText.checkName(s), PleaText.byteLength(s). Each also takes a Uint8Array: raw bytes, as a
 * letter's transaction data or an ABI string argument can carry (invalid UTF-8 included).
 * Positions: issue.at is the character number as the writer counts characters (an emoji with its
 * modifiers is one character; Intl.Segmenter graphemes), issue.index is the UTF-16 index in the
 * string (for setSelectionRange), issue.byte the byte offset. For raw bytes, messages give bytes.
 * Works as a browser global (window.PleaText) and as a CommonJS module (tests in tools/). */
(function (root) {
  'use strict';

  var MAX_BYTES = 280;
  var NAME_MIN = 3;
  var NAME_MAX = 20;
  var RESERVED_NAMES = ['cabal', 'admin', 'imd', 'plea', 'owner'];

  /* Code points the contract refuses beyond ASCII (CabalGate._refused, Unicode 15.1): inclusive
     ranges, a plain name for the message, and 'format' for visible format characters. */
  var REFUSED = [
    [0x80, 0x9f, 'invisible control character'],
    [0xad, 0xad, 'invisible soft hyphen'],
    [0x34f, 0x34f, 'invisible combining grapheme joiner'],
    [0x600, 0x605, 'Arabic number sign', 'format'],
    [0x61c, 0x61c, 'invisible Arabic letter mark'],
    [0x6dd, 0x6dd, 'Arabic end-of-ayah sign', 'format'],
    [0x70f, 0x70f, 'Syriac abbreviation mark', 'format'],
    [0x890, 0x891, 'Arabic pound or piastre mark', 'format'],
    [0x8e2, 0x8e2, 'Arabic disputed end-of-ayah sign', 'format'],
    [0x115f, 0x1160, 'invisible Hangul filler'],
    [0x17b4, 0x17b5, 'invisible Khmer inherent vowel'],
    [0x180b, 0x180f, 'invisible Mongolian variation selector'],
    [0x200b, 0x200b, 'invisible zero-width space'],
    [0x200c, 0x200c, 'invisible zero-width non-joiner'],
    [0x200d, 0x200d, 'invisible zero-width joiner'],
    [0x200e, 0x200f, 'invisible text-direction mark'],
    [0x2028, 0x2028, 'line separator'],
    [0x2029, 0x2029, 'paragraph separator'],
    [0x202a, 0x202e, 'invisible text-direction control'],
    [0x2060, 0x2060, 'invisible word joiner'],
    [0x2061, 0x206f, 'invisible format character'],
    [0x3164, 0x3164, 'invisible Hangul filler'],
    [0xfe00, 0xfe0e, 'invisible variation selector'],
    [0xfe0f, 0xfe0f, 'invisible emoji variation selector'],
    [0xfeff, 0xfeff, 'invisible byte order mark'],
    [0xffa0, 0xffa0, 'invisible Hangul filler'],
    [0xfff0, 0xfffb, 'invisible annotation or reserved character'],
    [0x110bd, 0x110bd, 'Kaithi number sign', 'format'],
    [0x110cd, 0x110cd, 'Kaithi number sign above', 'format'],
    [0x13430, 0x1343f, 'Egyptian hieroglyph format control', 'format'],
    [0x1bca0, 0x1bca3, 'shorthand format control', 'format'],
    [0x1d173, 0x1d17a, 'musical format control', 'format'],
    [0xe0000, 0xe0fff, 'invisible tag or variation selector']
  ];

  var enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  var segmenter = null;
  try {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  } catch (e) { segmenter = null; }

  function isBytes(x) {
    return typeof x === 'object' && x !== null && typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(x);
  }

  function utf8(text) {
    if (isBytes(text)) return text instanceof Uint8Array ? text : new Uint8Array(text.buffer, text.byteOffset, text.byteLength);
    if (enc) return enc.encode(text);
    return Uint8Array.from(Buffer.from(String(text), 'utf8'));
  }

  function byteLength(text) {
    return utf8(text).length;
  }

  function hex(cp) {
    var h = cp.toString(16).toUpperCase();
    while (h.length < 4) h = '0' + h;
    return 'U+' + h;
  }

  function refusedEntry(cp) {
    for (var k = 0; k < REFUSED.length; k++) {
      if (cp >= REFUSED[k][0] && cp <= REFUSED[k][1]) return REFUSED[k];
    }
    return null;
  }

  function refusedName(cp) {
    var e = refusedEntry(cp);
    return e ? e[2] : null;
  }

  function plural(n, one) {
    return n + ' ' + one + (n === 1 ? '' : 's');
  }

  /* ---------------------------------------------------------------- the byte walk
     _validateText on b[from..n): the same reads in the same order. Collects every issue instead of
     stopping at the first, so a writer can fix them in one go; the contract refuses a text exactly
     when this finds at least one (the walk is identical up to the contract's first revert). */
  function walk(b, from) {
    var issues = [];
    var n = b.length;
    var i = from;
    while (i < n) {
      var c = b[i];
      if (c < 0x20 || c === 0x7f) {
        issues.push({ code: 'control', byte: i, char: c });
        i++;
        continue;
      }
      if (c === 0x5b) {
        var m = markerAt(b, i, n);
        if (m) issues.push({ code: 'marker', byte: i, marker: m });
      }
      if (c < 0x80) { i++; continue; }
      var len;
      if (c >= 0xc2 && c <= 0xdf) len = 2;
      else if (c >= 0xe0 && c <= 0xef) len = 3;
      else if (c >= 0xf0 && c <= 0xf4) len = 4;
      else { issues.push({ code: 'utf8', byte: i }); i++; continue; }
      if (i + len > n) { issues.push({ code: 'utf8', byte: i, end: true }); break; }
      var cp = c & (0x7f >> len);
      var badAt = 0;
      for (var k = 1; k < len; k++) {
        var cb = b[i + k];
        if ((cb & 0xc0) !== 0x80) { badAt = k; break; }
        cp = (cp << 6) | (cb & 0x3f);
      }
      if (badAt) { issues.push({ code: 'utf8', byte: i }); i += badAt; continue; }
      if ((len === 3 && cp < 0x800) || (len === 4 && cp < 0x10000) || (cp >> 11) === 0x1b || cp > 0x10ffff) {
        issues.push({ code: 'utf8', byte: i });
      } else if (refusedName(cp)) {
        issues.push({ code: 'refused', byte: i, cp: cp });
      }
      i += len;
    }
    return issues;
  }

  /* _checkMarker: at a '[' (byte i), an optional '/', then "plea" (4 bytes) or "objection" (9 bytes)
     in any ASCII case. Returns the matched text as written (e.g. "PLEA", "/plea", "Objection"). */
  function markerAt(b, i, n) {
    var j = i + 1;
    var slash = '';
    if (j < n && b[j] === 0x2f) { j++; slash = '/'; }
    if (j + 4 > n) return null;
    var w4 = '';
    for (var k = 0; k < 4; k++) w4 += String.fromCharCode(b[j + k] | 0x20);
    if (w4 === 'plea') return slash + String.fromCharCode(b[j], b[j + 1], b[j + 2], b[j + 3]);
    if (j + 9 <= n) {
      var w9 = '';
      for (var q = 0; q < 9; q++) w9 += String.fromCharCode(b[j + q] | 0x20);
      if (w9 === 'objection') {
        var raw = '';
        for (var r = 0; r < 9; r++) raw += String.fromCharCode(b[j + r]);
        return slash + raw;
      }
    }
    return null;
  }

  /* ---------------------------------------------------------------- positions
     Maps a byte offset of the encoded text back to the writer's string: the UTF-16 index and the
     character number (grapheme). A lone surrogate is encoded as U+FFFD (3 bytes), as TextEncoder
     does. For raw bytes there is no string: positions are bytes. */
  function locator(src, b) {
    if (typeof src !== 'string') {
      return {
        raw: true,
        count: function () { return null; },
        at: function (byte) { return { byte: byte }; }
      };
    }
    var u16 = new Int32Array(b.length + 1).fill(-1);
    var bo = 0;
    for (var s = 0; s < src.length; s++) {
      u16[bo] = s;
      var u = src.charCodeAt(s);
      if (u < 0x80) bo += 1;
      else if (u < 0x800) bo += 2;
      else if (u >= 0xd800 && u <= 0xdbff && s + 1 < src.length && (src.charCodeAt(s + 1) & 0xfc00) === 0xdc00) { bo += 4; s++; }
      else bo += 3;
    }
    u16[bo] = src.length;
    var gnum = new Int32Array(src.length + 1);
    var gstart = [];
    var g = 0;
    if (segmenter) {
      var it = segmenter.segment(src)[Symbol.iterator]();
      for (var x = it.next(); !x.done; x = it.next()) {
        g++;
        gstart.push(x.value.index);
        for (var q = 0; q < x.value.segment.length; q++) gnum[x.value.index + q] = g;
      }
    } else {
      for (var p = 0; p < src.length; p++) {
        var lead = (src.charCodeAt(p) & 0xfc00) === 0xdc00 && p > 0 && (src.charCodeAt(p - 1) & 0xfc00) === 0xd800;
        if (!lead) { g++; gstart.push(p); }
        gnum[p] = g;
      }
    }
    gnum[src.length] = g + 1;
    gstart.push(src.length);
    return {
      raw: false,
      count: function (fromIndex) { return g - (fromIndex ? gnum[fromIndex] - 1 : 0); },
      at: function (byte) {
        var index = u16[byte];
        var n = gnum[index];
        return { byte: byte, index: index, at: n, grapheme: src.slice(gstart[n - 1], gstart[n]), before: src.slice(0, index) };
      }
    };
  }

  /* A few words of the text before a position, to point at an invisible character. */
  function snippetBefore(before) {
    var s = before.slice(-24);
    var nl = Math.max(s.lastIndexOf('\n'), s.lastIndexOf('\r'));
    var cut = before.length > 24;
    if (nl !== -1) { s = s.slice(nl + 1); cut = false; }
    if (cut) {
      var sp = s.indexOf(' ');
      if (sp !== -1 && sp < s.length - 2) s = s.slice(sp + 1);
      else if ((s.charCodeAt(0) & 0xfc00) === 0xdc00) s = s.slice(1);
      s = '…' + s;
    }
    return visible(s) ? s : '';
  }

  /* What is left of `s` once refused characters, controls and spaces are taken out. */
  function visible(s) {
    var out = '';
    for (var k = 0; k < s.length; k++) {
      var c = s.codePointAt(k);
      if (c > 0xffff) k++;
      if (c <= 0x20 || c === 0x7f || refusedName(c)) continue;
      out += String.fromCodePoint(c);
    }
    return out;
  }

  /* " right after “sandwich.” (character 120)", " inside “❤️” (character 3)", " at byte 12". */
  function where(pos, invisibleThing) {
    if (pos.at === undefined) return ' at byte ' + (pos.byte + 1);
    if (!invisibleThing) return ' at character ' + pos.at;
    if (visible(pos.grapheme)) return ' inside “' + pos.grapheme + '” (character ' + pos.at + ')';
    if (pos.index === 0) return ' at the very start';
    var s = snippetBefore(pos.before);
    return s ? ' right after “' + s + '” (character ' + pos.at + ')' : ' at character ' + pos.at;
  }

  function controlMessage(c, pos, noun) {
    if (c === 0x0a || c === 0x0d) return 'Remove the line break' + where(pos, true) + ': ' + noun.a + ' is one line.';
    if (c === 0x09) return 'Remove the tab' + where(pos, true) + '.';
    if (c === 0x7f) return 'Remove the invisible delete character (U+007F)' + where(pos, true) + '.';
    return 'Remove the invisible control character (' + hex(c) + ')' + where(pos, true) + '.';
  }

  function issueMessage(x, pos, noun) {
    if (x.code === 'control') return controlMessage(x.char, pos, noun);
    if (x.code === 'marker') {
      var w = x.marker.replace(/^\//, '').toLowerCase();
      return 'Remove “[' + x.marker + '”' + where(pos, false) + ': the contract refuses “[' + w + '” and “[/' + w +
        '” in any case, even inside a longer word like “[' + (w === 'plea' ? 'please' : 'objections') + '”. Drop the “[” or use “(”.';
    }
    if (x.code === 'utf8') return 'Bad UTF-8' + where(pos, false) + (x.end ? ': the text ends in the middle of a character.' : ': these bytes are not a valid character.');
    if (x.code === 'refused') {
      var tip = x.cp === 0xfe0f ? ' Emoji like ❤️ carry one: use the plain ❤ or another emoji.'
        : x.cp === 0x200d ? ' Joined emoji such as 👩‍💻 or 👨‍👩‍👧 are built with it: use single emoji instead.'
          : x.cp >= 0xe0000 && x.cp <= 0xe007f ? ' The flags of England, Scotland and Wales are built with these: use another flag.'
            : x.cp === 0x2028 || x.cp === 0x2029 ? ' ' + noun.A + ' is one line.'
              : refusedEntry(x.cp)[3] === 'format' ? ' The contract refuses format characters like this one.' : '';
      return 'Remove the ' + refusedName(x.cp) + ' (' + hex(x.cp) + ')' + where(pos, true) + '.' + tip;
    }
    return '';
  }

  var NOUNS = {
    plea: { a: 'a plea', A: 'A plea' },
    objection: { a: 'an objection', A: 'An objection' }
  };

  /* The gate's rules on b[base..]: issues with positions in `src` and messages. */
  function textIssues(src, b, base, noun, loc) {
    var issues = [];
    var n = b.length - base;
    if (n === 0) issues.push({ code: 'empty', message: 'Write something: ' + noun.a + ' cannot be empty.' });
    if (n > MAX_BYTES) {
      var over = n - MAX_BYTES;
      var wide = false;
      for (var k = base; k < b.length; k++) if (b[k] >= 0x80) { wide = true; break; }
      issues.push({ code: 'too-long', message: 'Too long: ' + n + ' bytes, the most is 280. Cut ' + plural(over, 'byte') + '.' +
        (wide ? ' Letters outside A–Z take 2 to 4 bytes each (most emoji take 4).' : '') });
    }
    // Lone surrogates in a JS string become U+FFFD when encoded; the contract would accept the
    // replacement character, but the writer did not type it, so it is flagged (not a contract refusal).
    if (typeof src === 'string') {
      for (var s = base; s < src.length; s++) {
        var u = src.charCodeAt(s);
        if (u >= 0xd800 && u <= 0xdbff && (src.charCodeAt(s + 1) & 0xfc00) === 0xdc00) { s++; continue; }
        if (u >= 0xd800 && u <= 0xdfff) {
          var bp = enc ? enc.encode(src.slice(0, s)).length : Buffer.byteLength(src.slice(0, s));
          var p = loc.at(bp);
          issues.push({ code: 'broken', warning: true, at: p.at, index: p.index, byte: bp,
            message: 'Character ' + p.at + ' is broken (half of an emoji or symbol) and would be sent as “\uFFFD”: delete it and type it again.' });
        }
      }
    }
    var found = walk(b, base);
    for (var f = 0; f < found.length; f++) {
      var x = found[f];
      var pos = loc.at(x.byte);
      var issue = { code: x.code, at: pos.at, index: pos.index, byte: x.byte, message: issueMessage(x, pos, noun) };
      if (x.char !== undefined) issue.char = x.char;
      if (x.cp !== undefined) issue.cp = x.cp;
      // one message per thing to fix: the two joiners of a family emoji, the CR LF of one line break
      if (pos.at !== undefined && x.code === 'control') issue.key = 'control|' + pos.at + '|' + (x.char === 0x0a || x.char === 0x0d ? 'nl' : x.char);
      if (pos.at !== undefined && x.code === 'refused') issue.key = 'refused|' + pos.at + '|' + refusedName(x.cp);
      issues.push(issue);
    }
    return dedupe(issues);
  }

  function dedupe(issues) {
    var seen = {};
    return issues.filter(function (x) {
      var key = x.key || x.message;
      delete x.key;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function result(issues, extra) {
    var refusals = issues.filter(function (x) { return !x.warning; });
    var r = { ok: refusals.length === 0, issues: issues };
    for (var k in extra) r[k] = extra[k];
    return r;
  }

  /* The gate's rules on a text: { ok, bytes, max, chars, error, issues: [{ code, message, at, index,
     byte }] }. `ok` is what the contract decides; `error` is the custom error it reverts with. */
  function checkText(text, errorName) {
    errorName = errorName || 'BadPleaText';
    var noun = errorName === 'BadObjectionText' ? NOUNS.objection : NOUNS.plea;
    var b = utf8(text);
    var loc = locator(text, b);
    var issues = textIssues(text, b, 0, noun, loc);
    var r = result(issues, { bytes: b.length, max: MAX_BYTES, chars: loc.raw ? countChars(b, 0) : loc.count(0) });
    r.error = r.ok ? null : errorName;
    return r;
  }

  /* Characters in raw bytes, decoding as the walk does (an invalid byte counts as one). */
  function countChars(b, from) {
    var n = 0;
    for (var i = from; i < b.length; n++) {
      var c = b[i];
      var len = c >= 0xc2 && c <= 0xdf ? 2 : c >= 0xe0 && c <= 0xef ? 3 : c >= 0xf0 && c <= 0xf4 ? 4 : 1;
      var k = 1;
      while (k < len && i + k < b.length && (b[i + k] & 0xc0) === 0x80) k++;
      i += k;
    }
    return n;
  }

  /* Letterbox._isWord: `word` alone, or followed by a space or a newline (capitals only). */
  function isWord(b, word) {
    var nw = word.length;
    if (b.length < nw) return false;
    if (b.length > nw && b[nw] !== 0x20 && b[nw] !== 0x0a) return false;
    for (var k = 0; k < nw; k++) if (b[k] !== word.charCodeAt(k)) return false;
    return true;
  }

  /* Letterbox._after: the bytes after the command word and its separator (none for the bare word).
     The command words are ASCII, so the byte offset is also the UTF-16 index in the string. */
  function after(b, n) {
    return b.length > n + 1 ? n + 1 : b.length;
  }

  function slice(src, b, from) {
    return typeof src === 'string' ? src.slice(from) : b.subarray(from);
  }

  function shown(x) {
    if (typeof x === 'string') return x;
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8', { ignoreBOM: true }).decode(x);
    return Buffer.from(x).toString('utf8');
  }

  /* A letter as the Letterbox reads it (raw input data or letter(text)). Returns
     { kind: 'plea'|'appeal'|'sell'|'name'|'clear-name', body, ok, bytes, issues, reads, error }.
     `body` is the text the gate gets (or the name), from the same string (or bytes) that came in.
     `reads` says in plain words what the letter does. Contract-side conditions that depend on chain
     state (cooldown, an open plea, nothing to appeal, a taken name, the balance) are not checked here. */
  function checkLetter(text) {
    var b = utf8(text);
    var loc = locator(text, b);
    var res;
    if (isWord(b, 'APPEAL')) {
      var from = after(b, 6);
      res = textLetter('appeal', text, b, from, loc, 'An appeal of your latest denied plea, for its original share of your PLEA. If approved, anyone can sell it for you within 7 minutes for the 0.25 IMD tip.');
      if (from === b.length) res.issues[0] = { code: 'empty', message: 'APPEAL needs your appeal text after it: APPEAL <text>.' };
    } else if (isWord(b, 'NAME')) {
      var nf = after(b, 4);
      var nm = slice(text, b, nf);
      if (nf === b.length) {
        res = { kind: 'clear-name', body: nm, ok: true, bytes: b.length, issues: [], error: null, reads: 'Clears your display name.' };
      } else {
        var cn = nameIssues(text, b, nf, loc);
        res = result(cn, { kind: 'name', body: nm, bytes: b.length, reads: 'Sets your display name to “' + shown(nm) + '”.' });
        res.error = res.ok ? null : 'BadName';
      }
    } else if (isWord(b, 'SELL')) {
      res = { kind: 'sell', body: slice(text, b, b.length), ok: true, bytes: b.length, issues: [], error: null, reads: 'Sells your approved letter plea now (if no runner has yet), and the 0.25 IMD tip comes back to you.' };
      if (b.length > 4) res.issues.push({ code: 'ignored', warning: true, message: 'Everything after SELL is ignored: this letter is read as SELL, not as a plea. To plead, start with another word (or write “sell” in lower case).' });
    } else {
      res = textLetter('plea', text, b, 0, loc, 'A new plea for 20% of your PLEA (at most 2,500,000). If approved, anyone can sell it for you within 7 minutes for the 0.25 IMD tip.');
      var head = '';
      for (var k = 0; k < b.length && k < 7; k++) head += String.fromCharCode(b[k]);
      var first = /^(appeal|sell|name)(?![A-Za-z0-9_])/i.exec(head);
      if (first) {
        var w = first[1];
        var W = w.toUpperCase();
        res.issues.push(w === W
          ? { code: 'separator', warning: true, message: 'A command word is followed by a space or a new line: here “' + W + '” is not, so this is a plain plea, not the ' + W + ' command.' }
          : { code: 'case', warning: true, message: 'Commands are in capitals: “' + w + '” here starts a plain plea, not the ' + W + ' command.' });
      }
    }
    return res;
  }

  function textLetter(kind, src, b, from, loc, reads) {
    var bytes = b.length - from;
    var issues = textIssues(src, b, from, NOUNS.plea, loc);
    var r = result(issues, { kind: kind, body: slice(src, b, from), bytes: bytes, max: MAX_BYTES, chars: loc.raw ? countChars(b, from) : loc.count(from), reads: reads });
    // _checkLength runs first in the Letterbox and names the length.
    r.error = r.ok ? null : bytes > MAX_BYTES ? 'LetterTooLong(' + bytes + ', 280)' : 'BadPleaText';
    return r;
  }

  /* [what it is, a hint] for the first character a name may not hold. */
  function describeNameChar(c, pos) {
    if (c === 0x20) return ['the space', ''];
    if (c === 0x0a || c === 0x0d) return ['the line break', ''];
    if (c === 0x09) return ['the tab', ''];
    if (pos.at === undefined) return ['the byte 0x' + (c < 16 ? '0' : '') + c.toString(16), ''];
    var cp = pos.grapheme.codePointAt(0);
    if (refusedName(cp)) return ['the ' + refusedName(cp) + ' (' + hex(cp) + ')', ''];
    if (cp < 0x20 || cp === 0x7f || !visible(pos.grapheme)) return ['the invisible ' + hex(cp), ''];
    var lower = pos.grapheme.toLowerCase();
    return ['“' + pos.grapheme + '”', lower !== pos.grapheme && /^[a-z]$/.test(lower) ? ' (use “' + lower + '”)' : ''];
  }

  /* Letterbox._checkName on b[from..]. */
  function nameIssues(src, b, from, loc) {
    var issues = [];
    var n = b.length - from;
    var ascii = true;
    var badAt = -1;
    for (var k = from; k < b.length; k++) {
      var c = b[k];
      if (c >= 0x80) ascii = false;
      if (badAt === -1 && !((c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || c === 0x5f)) badAt = k;
    }
    // The contract counts bytes; for an ASCII name that is the number of characters. A name with
    // other characters is refused for them, and its byte count would only confuse.
    if ((n < NAME_MIN || n > NAME_MAX) && ascii) issues.push({ code: 'name-length', message: 'Use 3 to 20 characters (now ' + n + ').' });
    if (badAt !== -1) {
      var pos = loc.at(badAt);
      var at = pos.at === undefined ? ' at byte ' + (badAt + 1) : ' at character ' + pos.at;
      var what = describeNameChar(b[badAt], pos);
      issues.push({ code: 'name-chars', at: pos.at, index: pos.index, byte: badAt,
        message: 'Only lower-case a–z, digits 0–9 and _ are allowed: ' + what[0] + at + ' is not' + what[1] + '.' });
    }
    if (n >= NAME_MIN && n <= NAME_MAX && badAt === -1) {
      var name = '';
      for (var q = from; q < b.length; q++) name += String.fromCharCode(b[q]);
      if (RESERVED_NAMES.indexOf(name) !== -1) issues.push({ code: 'name-reserved', message: '“' + name + '” is reserved (cabal, admin, imd, plea and owner are).' });
    }
    return issues;
  }

  /* setName: 3-20 bytes of a-z 0-9 _, not reserved (Letterbox._checkName); an empty name clears it.
     Uniqueness is on chain (NameTaken). */
  function checkName(name) {
    var b = utf8(name);
    if (b.length === 0) {
      return { ok: true, clears: true, error: null, issues: [{ code: 'clear', message: 'An empty name clears your display name.' }] };
    }
    var r = result(nameIssues(name, b, 0, locator(name, b)), {});
    r.error = r.ok ? null : 'BadName';
    return r;
  }

  /* "193 / 280 bytes". */
  function bytesLabel(text) {
    var n = byteLength(text);
    return n + ' / ' + MAX_BYTES + ' bytes';
  }

  var api = {
    MAX_BYTES: MAX_BYTES,
    REFUSED: REFUSED,
    RESERVED_NAMES: RESERVED_NAMES,
    byteLength: byteLength,
    bytesLabel: bytesLabel,
    checkText: checkText,
    checkObjection: function (s) { return checkText(s, 'BadObjectionText'); },
    checkLetter: checkLetter,
    checkName: checkName
  };
  root.PleaText = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
