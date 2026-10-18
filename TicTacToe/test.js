'use strict';
// Test kółka i krzyżyka (jeden plik index.html): node test.js
// Sprawdza tłumaczenia PL/EN (w tym samouczek) i to, że gra nie zostawia na sztywno polskich tekstów w interfejsie.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let n = 0;
const ok = m => console.log('  ok', ++n, m);
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);

// słownik: pierwszy skrypt zawiera I18N
const sandbox = { navigator: { language: 'pl' }, localStorage: { getItem: () => null, setItem() {} }, document: { documentElement: {}, querySelectorAll: () => [], getElementById: () => null } };
vm.createContext(sandbox);
vm.runInContext(scripts[0] + ';this.I18N = I18N;', sandbox);
const { pl, en } = sandbox.I18N;
assert.deepStrictEqual([Object.keys(pl).filter(k => !(k in en)), Object.keys(en).filter(k => !(k in pl))], [[], []]); ok('tłumaczenia: te same klucze po polsku i angielsku (' + Object.keys(pl).length + ')');
const ids = [...scripts[1].matchAll(/\{ id: '(\w+)', scene:/g)].map(m => m[1]);
assert.deepStrictEqual(ids, ['goal', 'play']);
for (const id of ids) for (const part of ['title', 'text']) for (const L of [pl, en]) assert.ok(typeof L[`tut.${id}.${part}`] === 'string' && L[`tut.${id}.${part}`].length > (part === 'title' ? 2 : 10), `brak tut.${id}.${part}`);
ok('samouczek: kroki mają tytuły i teksty po polsku i angielsku');
for (const k of Object.keys(pl)) if (typeof pl[k] === 'string' && pl[k] === en[k]) assert.ok(!/[a-ząćęłńóśźż]/i.test(pl[k]), 'identyczny tekst PL i EN: ' + k);
ok('teksty PL i EN różnią się (poza samymi znakami i emoji)');
// wszystkie napisy w znacznikach mają odpowiedniki w słowniku
for (const m of html.matchAll(/data-i18n(?:-title|-aria)?="([^"]+)"/g)) assert.ok(m[1] in pl, 'brak klucza w słowniku: ' + m[1]);
ok('każdy data-i18n w stronie ma tłumaczenie');
// logika gry używa kluczy, a nie polskich napisów
assert.ok(!/statusEl\.textContent\s*=\s*'/.test(html)); ok('statusy gry korzystają ze słownika (setStatus)');
assert.ok(html.includes('Tutorial.autoOpen()') && html.includes('id="tutorial"') && html.includes('id="tutBtn"')); ok('strona ma okno samouczka i otwiera go przy pierwszej wizycie');
// logika kółka i krzyżyka: minimax nie przegrywa (wyciągamy funkcje ze skryptu gry)
const game = scripts[2].split('// --- Muzyka')[0].replace(/document\.getElementById\([^)]*\)/g, '({ addEventListener() {}, set textContent(v) {}, get textContent() { return ""; }, querySelectorAll() { return []; }, appendChild() {}, set innerHTML(v) {}, value: "hard" })');
vm.runInContext(game.replace(/localStorage/g, '({getItem(){return null},setItem(){}})').replace(/\nrenderScore\(\);\nnewGame\(\);\n[\s\S]*$/, '\n') + ';this.api = { winner, full, computerMove, minimax, setBoard: b => { board = b; }, setLevel: v => { levelEl.value = v; } };', sandbox);
const A = sandbox.api; A.setLevel('hard');
let lost = 0;
for (let g = 0; g < 300; g++) {
  const b = Array(9).fill(null); A.setBoard(b);
  let turn = g % 2 ? 'O' : 'X';
  while (!A.winner(b) && !A.full(b)) {
    if (turn === 'O') b[A.computerMove()] = 'O';
    else { const f = b.map((v, i) => v ? -1 : i).filter(i => i >= 0); b[f[Math.floor(Math.random() * f.length)]] = 'X'; }
    turn = turn === 'O' ? 'X' : 'O';
  }
  const w = A.winner(b); if (w && w.who === 'X') lost++;
}
assert.strictEqual(lost, 0); ok('poziom trudny: komputer nie przegrał w 300 losowych partiach');

console.log('\nWszystkie testy przeszły (' + n + ').');
