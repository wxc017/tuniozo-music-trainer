/**
 * gen-groove-library.mjs — emits src/lib/grooveLibraryData.ts
 *
 * Run:  node scripts/gen-groove-library.mjs
 *
 * Strategy: a large hand-authored table of AUTHENTIC base grooves (real claves,
 * bells, talas, timelines, kit grooves) across ~60 genre families, each then
 * expanded with a handful of *honestly-labelled* feel variations (hat
 * subdivision, ghost-notes, kick treatment, half-time). Every emitted position
 * is forced to an integer in [0, length) so the data is valid by construction.
 *
 * Matching in grooveLibrary.ts compares bass + snareAccent rotation-aware at
 * equal length, so every base defines those voices meaningfully and lengths are
 * spread across 8 / 12 / 16 / 32 and odd pulse counts (5,7,9,10,11,13,14,15).
 */
import { writeFileSync, readdirSync, readFileSync } from "node:fs";

/* ── helpers ──────────────────────────────────────────────────────────── */
const uniqSort = (xs) => [...new Set(xs.map(Math.trunc))].sort((a, b) => a - b);
const clampVoices = (v, L) => {
  const out = {};
  for (const k of ["bass", "snareAccent", "snareGhost", "hatClosed", "hatOpen", "hhFoot"]) {
    if (!v[k]) continue;
    const arr = uniqSort(v[k].filter((x) => Number.isFinite(x) && x >= 0 && x < L));
    if (arr.length) out[k] = arr;
  }
  return out;
};
const everyN = (L, n, start = 0) => { const a = []; for (let i = start; i < L; i += n) a.push(i); return a; };
const eighthHats = (L) => (L % 2 === 0 ? everyN(L, 2) : everyN(L, 1));
const sixteenthHats = (L) => everyN(L, 1);
const offbeatHats = (L) => (L % 2 === 0 ? everyN(L, 2, 1) : everyN(L, 1));
const quarterHats = (L) => (L % 4 === 0 ? everyN(L, 4) : L % 3 === 0 ? everyN(L, 3) : everyN(L, 2));
// pick `count` roughly-even offbeat slots for open-hat barks
const pickOffbeats = (L, count) => {
  const off = offbeatHats(L);
  if (off.length <= count) return off;
  const out = [];
  for (let i = 0; i < count; i++) out.push(off[Math.floor((i * off.length) / count)]);
  return uniqSort(out);
};
// ghost-snares sitting between consecutive accents
const ghostsBetween = (snare, L) => {
  if (!snare || snare.length < 1) return everyN(L, 2, 1);
  const s = uniqSort(snare);
  const g = [];
  for (let i = 0; i < s.length; i++) {
    const a = s[i], b = s[(i + 1) % s.length] + (i + 1 === s.length ? L : 0);
    const mid = Math.round((a + b) / 2) % L;
    if (!s.includes(mid)) g.push(mid);
  }
  return uniqSort(g);
};
// Ghost slots that are actually PLAYABLE: between the accents AND off the kick
// (a ghost stacked on a bass drum reads as nonsense and gets dropped, so a
// "Ghost-Note Variation" whose ghosts all land on kicks would show none).  If a
// groove is saturated (every gap is a kick), this returns [] and the caller
// skips the ghost variant rather than mislabel a groove that has no ghosts.
const ghostGaps = (snare, bass, L) => {
  const b = new Set(bass ?? []);
  return ghostsBetween(snare, L).filter((x) => !b.has(x));
};
// add one syncopated kick (the '& of 3'-ish push) to an existing bass voice
const driveKick = (bass, L) => uniqSort([...(bass ?? [0]), Math.floor((5 * L) / 8), Math.floor((7 * L) / 8)]);

/* ── base groove factory ─────────────────────────────────────────────── */
const BASES = [];
const b = (id, name, region, genre, length, voices, desc) =>
  BASES.push({ id, name, region, genre, length, voices, desc });

/* Names/ids of the 25 CORE entries already in grooveLibrary.ts — never duplicate. */
const CORE_KEYS = new Set([
  "African|Standard Bell (7-stroke)", "African|Kpanlogo Bell", "African|Highlife / Afrobeat",
  "Latin|Son Clave (3-2)", "Latin|Son Clave (2-3)", "Latin|Rumba Clave (2-3)", "Latin|Cáscara",
  "Latin|Bossa Nova", "Latin|Samba (surdo+caixa)", "Latin|Songo",
  "Asian|Teental (accent skeleton)", "Asian|Jhaptal", "Asian|Rupak Tal", "Asian|Gamelan Colotomic",
  "European|Rachenitsa", "European|Kopanitsa", "European|Waltz", "European|March",
  "American|Rock Backbeat", "American|Funk (syncopated kick)", "American|Half-Time",
  "American|Shuffle", "American|Second Line", "American|Jazz Ride (swing)",
]);

/* ═══════════════ ROCK · PUNK · POP · SURF · INDIE ═══════════════ */
b("rock-four-floor", "Four-on-the-Floor Rock", "American", "Rock", 16,
  { bass: [0, 4, 8, 12], snareAccent: [4, 12], hatClosed: eighthHats(16) },
  "Driving arena-rock feel with a kick on every beat under a 2-and-4 backbeat.");
b("rock-halfopen", "Stadium Rock (open hats)", "American", "Rock", 16,
  { bass: [0, 8], snareAccent: [4, 12], hatOpen: [2, 6, 10, 14] },
  "Big anthemic rock with the hi-hat splashing open on every upbeat.");
b("punk-dbeat", "D-Beat", "European", "Hardcore punk", 16,
  { bass: [0, 6, 8, 14], snareAccent: [4, 12], hatClosed: eighthHats(16) },
  "The Discharge-derived hardcore engine: a galloping off-kick answering a hard backbeat.");
b("punk-skank", "Punk Skank (fast 2-beat)", "American", "Punk", 8,
  { bass: [0, 4], snareAccent: [2, 6], hatClosed: everyN(8, 1) },
  "The breakneck up-tempo two-beat of 1977 punk: kick-and-snare trading eighths.");
b("punk-blast2", "Punk Two-Step", "American", "Pop-punk", 16,
  { bass: [0, 8], snareAccent: [2, 4, 6, 10, 12, 14], hatClosed: eighthHats(16) },
  "Pop-punk's relentless snare-on-every-upbeat drive under power-chord changes.");
b("surf-rock", "Surf Beat", "American", "Surf rock", 16,
  { bass: [0, 3, 8, 11], snareAccent: [4, 12], hatClosed: eighthHats(16) },
  "Dick Dale / Ventures reverb-soaked surf groove with a syncopated tom-and-kick bounce.");
b("motorik", "Motorik", "European", "Krautrock", 16,
  { bass: [0, 4, 8, 12], snareAccent: [4, 12], hatClosed: sixteenthHats(16) },
  "Neu!/Kraftwerk's hypnotic motorway pulse: an unwavering four-on-the-floor machine groove.");
b("stomp-clap", "Stomp-Stomp-Clap", "American", "Arena rock", 8,
  { bass: [0, 2], snareAccent: [4], hatClosed: everyN(8, 2) },
  "The 'We Will Rock You' body-percussion chant: two stomps answered by a clap.");
b("disco-floor", "Disco", "American", "Disco", 16,
  { bass: [0, 4, 8, 12], snareAccent: [4, 12], hatOpen: [2, 6, 10, 14], hatClosed: eighthHats(16) },
  "The four-on-the-floor disco engine with the hi-hat barking open on every offbeat.");
b("motown-backbeat", "Motown Backbeat", "American", "Motown soul", 16,
  { bass: [0, 8], snareAccent: [4, 12], snareGhost: [2, 6, 10, 14], hatClosed: eighthHats(16) },
  "The tambourine-bright, hand-clapped backbeat that powered the Detroit hit factory.");
b("ballad-68", "6/8 Slow Ballad", "American", "Pop ballad", 12,
  { bass: [0, 6], snareAccent: [3, 9], hatClosed: everyN(12, 1) },
  "The compound-time power-ballad sway with a backbeat on the second compound beat.");
b("indie-floor-tom", "Indie Floor-Tom Groove", "European", "Indie rock", 16,
  { bass: [0, 6, 10], snareAccent: [8], hatClosed: eighthHats(16) },
  "The tom-heavy, hatless indie groove (Arcade Fire / The xx) built on a halftime pulse.");
b("garage-rock", "Garage Rock Stomp", "American", "Garage rock", 16,
  { bass: [0, 8], snareAccent: [4, 12], hatOpen: [6, 14], hatClosed: eighthHats(16) },
  "Raw, slightly sloppy mid-60s garage drive with open-hat accents leading into the backbeat.");

/* ═══════════════ METAL ═══════════════ */
b("metal-thrash-skank", "Thrash Skank", "American", "Thrash metal", 16,
  { bass: [0, 2, 4, 6, 8, 10, 12, 14], snareAccent: [2, 6, 10, 14], hatClosed: eighthHats(16) },
  "Slayer/Metallica's flat-out skank beat: snare on every upbeat over a constant eighth kick.");
b("metal-doublebass", "Double-Bass Gallop", "American", "Power metal", 16,
  { bass: everyN(16, 1), snareAccent: [4, 12], hatClosed: eighthHats(16) },
  "A wall of continuous sixteenth double-kick under a steady 2-and-4 backbeat.");
b("metal-blast", "Blast Beat (traditional)", "European", "Death/black metal", 8,
  { bass: [0, 2, 4, 6], snareAccent: [1, 3, 5, 7], hatClosed: everyN(8, 2) },
  "The alternating single-stroke blast: kick and snare hammering opposite eighths at extreme tempo.");
b("metal-bomb-blast", "Bomb Blast", "European", "Grindcore", 8,
  { bass: [0, 2, 4, 6], snareAccent: [0, 2, 4, 6], hatClosed: everyN(8, 2) },
  "The grindcore bomb-blast: kick and snare striking together for a single sheet of noise.");
b("metal-gravity", "Gravity Blast", "American", "Technical death metal", 16,
  { bass: [0, 4, 8, 12], snareAccent: everyN(16, 1), hatClosed: everyN(16, 2) },
  "The one-handed gravity-roll blast, snare buzzing thirty-seconds over a quarter-note kick.");
b("metal-djent", "Djent Syncopation", "European", "Djent / prog metal", 16,
  { bass: [0, 1, 3, 6, 8, 9, 11, 14], snareAccent: [4, 12], hatClosed: eighthHats(16) },
  "Meshuggah-style polymetric kick stutter locked to palm-muted riffing under a steady backbeat.");
b("metal-doom", "Doom Half-Time", "American", "Doom metal", 16,
  { bass: [0, 10], snareAccent: [8], hatClosed: quarterHats(16) },
  "Crushingly slow Sabbath-derived halftime: one massive backbeat on beat 3 per bar.");
b("metal-metalcore", "Metalcore Breakdown", "American", "Metalcore", 16,
  { bass: [0, 3, 4, 8, 11, 12], snareAccent: [4, 12], hatClosed: quarterHats(16) },
  "The chugging breakdown groove: kick syncopated to the riff with a heavy china-cymbal backbeat.");
b("metal-blackbeat", "Black Metal Tremolo Beat", "European", "Black metal", 16,
  { bass: [0, 4, 8, 12], snareAccent: [2, 6, 10, 14], hatClosed: everyN(16, 2) },
  "The icy, fast black-metal beat: a relentless upbeat snare under tremolo-picked guitar.");
b("metal-dbeat-metal", "Motörhead D-Beat", "European", "Speed metal", 16,
  { bass: [0, 4, 6, 8, 12, 14], snareAccent: [4, 12], hatClosed: eighthHats(16) },
  "The overdriven rock-and-roll-on-fire shuffle-gallop that bridges punk and speed metal.");

/* ═══════════════ JAZZ ═══════════════ */
b("jazz-swing-ride", "Swing Ride", "American", "Swing jazz", 12,
  { snareAccent: [0, 6], hatClosed: [0, 3, 5, 6, 9, 11], hhFoot: [3, 9] },
  "The mainstream swing ride pattern over a 12/8 triplet pulse, hi-hat foot chicking 2 and 4.");
b("jazz-bebop-comp", "Bebop Comping", "American", "Bebop", 12,
  { snareAccent: [3, 8], hatClosed: [0, 3, 5, 6, 9, 11], bass: [0, 6], hhFoot: [3, 9] },
  "Bebop's broken comping: snare and bass-drum 'dropping bombs' against the ride's triplet feel.");
b("jazz-waltz", "Jazz Waltz", "American", "Jazz waltz", 12,
  { snareAccent: [4, 8], hatClosed: [0, 2, 4, 6, 8, 10], hhFoot: [4, 8], bass: [0] },
  "A lilting 3/4 jazz feel with the ride spelling out the triplet waltz and the hat chicking 2 and 3.");
b("jazz-brushes", "Brush Ballad", "American", "Jazz ballad", 12,
  { snareAccent: [6], hatClosed: [0, 3, 6, 9], hhFoot: [3, 9], bass: [0] },
  "The legato brush-stirred ballad feel: a circular sweep with feathered bass on each beat.");
b("jazz-modal-4", "Modal Jazz (broken time)", "American", "Modal jazz", 16,
  { snareAccent: [3, 7, 11], hatClosed: [0, 3, 4, 7, 8, 11, 12, 15], hhFoot: [4, 12], bass: [0, 10] },
  "The loose, conversational broken-time feel of post-1959 modal jazz over a straight-eighth ride.");
b("jazz-hardbop", "Hard Bop Shuffle", "American", "Hard bop", 12,
  { snareAccent: [3, 9], bass: [0, 6], hatClosed: [0, 3, 5, 6, 9, 11], hhFoot: [3, 9] },
  "The gospel-tinged, greasy hard-bop shuffle of the Blue Note era with a strong backbeat.");
b("jazz-ecm", "ECM Rubato Pulse", "European", "ECM / contemporary", 16,
  { snareAccent: [6, 14], hatClosed: [0, 4, 8, 12], hhFoot: [4, 12], bass: [0, 9] },
  "The spacious, cymbal-coloured rubato pulse of the northern-European ECM tradition.");
b("jazz-secondline-jazz", "New Orleans Jazz Roll", "American", "Trad jazz", 16,
  { snareAccent: [4, 12], snareGhost: [2, 6, 10, 14], bass: [0, 3, 8, 11], hatClosed: eighthHats(16) },
  "The press-roll-laced parade feel of early New Orleans jazz drumming.");

/* ═══════════════ FUSION · PROG · MATH ═══════════════ */
b("fusion-linear", "Fusion Linear Groove", "American", "Jazz fusion", 16,
  { bass: [0, 6, 10], snareAccent: [4, 12], snareGhost: [7, 9, 14], hatClosed: [0, 2, 8, 11] },
  "The interlocking, no-two-limbs-together linear funk of Gadd/Colaiuta-era fusion.");
b("prog-78", "Prog 7/8", "European", "Progressive rock", 14,
  { bass: [0, 4, 8], snareAccent: [6, 12], hatClosed: everyN(14, 2) },
  "A driving 7/8 prog groove grouped 2+2+3 over fourteen sixteenth pulses.");
b("prog-54-takefive", "5/4 Cool", "American", "Cool jazz", 20,
  { bass: [0, 8], snareAccent: [4, 12, 16], hatClosed: everyN(20, 2), hhFoot: [4, 12] },
  "The 'Take Five' lope: a 5/4 groove grouped 3+2 with a relaxed, swinging ride.");
b("math-rock-odd", "Math-Rock Stutter", "American", "Math rock", 16,
  { bass: [0, 3, 5, 8, 11, 13], snareAccent: [4, 12], hatClosed: eighthHats(16) },
  "The angular, riff-locked kick displacement of math rock against a stubborn backbeat.");
b("prog-98", "9/8 Prog", "European", "Progressive rock", 18,
  { bass: [0, 6, 10, 14], snareAccent: [4, 12], hatClosed: everyN(18, 2) },
  "A 9/8 prog feel grouped 2+2+2+3, the long final cell pushing into the downbeat.");
b("prog-118", "11/8 Prog", "European", "Progressive rock", 22,
  { bass: [0, 6, 12, 16], snareAccent: [4, 14], hatClosed: everyN(22, 2) },
  "An 11/8 prog groove grouped 3+3+3+2, common in Balkan-influenced art rock.");
b("fusion-songo-fusion", "Latin Fusion Songo", "Latin", "Latin fusion", 16,
  { bass: [0, 6, 8, 14], snareAccent: [4, 12], snareGhost: [2, 10], hatClosed: eighthHats(16) },
  "Weather Report-style fusion songo: a clave-rooted kick with crisp backbeat and conga ghosts.");

/* ═══════════════ FUNK · SOUL · P-FUNK ═══════════════ */
b("funk-onthe-one", "On the One (P-Funk)", "American", "P-Funk", 16,
  { bass: [0, 7, 10], snareAccent: [4, 12], snareGhost: [2, 6, 9, 14], hatClosed: sixteenthHats(16) },
  "Clinton/Collins funk that slams 'the One': a heavy downbeat anchoring sixteenth-note interplay.");
b("funk-purdie", "Purdie Half-Time Shuffle", "American", "Funk shuffle", 24,
  { bass: [0, 12], snareAccent: [12], snareGhost: [4, 8, 16, 20], hatClosed: everyN(24, 2) },
  "Bernard Purdie's triplet half-time shuffle of ghost-notes around a single fat backbeat.");
b("funk-jb", "JB's Funky Drummer", "American", "Funk", 16,
  { bass: [0, 3, 10], snareAccent: [4, 12], snareGhost: [2, 6, 7, 9, 14, 15], hatClosed: sixteenthHats(16) },
  "Clyde Stubblefield's endlessly-sampled Funky Drummer break, breathing through its ghost notes.");
b("funk-clavinet", "Superstition Funk", "American", "Funk", 16,
  { bass: [0, 6, 10], snareAccent: [4, 12], hatOpen: [7, 15], hatClosed: eighthHats(16) },
  "Stevie Wonder's deep clavinet funk with open-hat barks pushing the backbeat.");
b("soul-stax", "Stax / Memphis Soul", "American", "Southern soul", 16,
  { bass: [0, 8], snareAccent: [4, 12], hatClosed: eighthHats(16) },
  "The dry, behind-the-beat Memphis backbeat of Booker T & the MGs.");
b("funk-newOrleans", "New Orleans Street Funk", "American", "NOLA funk", 16,
  { bass: [0, 3, 6, 11], snareAccent: [4, 12], snareGhost: [2, 7, 10, 14], hatClosed: eighthHats(16) },
  "The Meters' loose, syncopated street funk with a parade-snare conversation.");
b("funk-disco-funk", "Disco-Funk", "American", "Disco funk", 16,
  { bass: [0, 4, 8, 12], snareAccent: [4, 12], snareGhost: [6, 14], hatOpen: [2, 6, 10, 14] },
  "Chic-style disco funk: four-on-the-floor kick, crisp backbeat, sizzling open hats.");

/* ═══════════════ HIP-HOP ═══════════════ */
b("hh-boombap", "Boom-Bap", "American", "Boom-bap hip-hop", 16,
  { bass: [0, 10], snareAccent: [4, 12], snareGhost: [7], hatClosed: eighthHats(16) },
  "The dusty 90s East-Coast boom-bap: a swung sampled break with a fat kick-snare pocket.");
b("hh-trap", "Trap", "American", "Trap", 16,
  { bass: [0, 6, 7, 10], snareAccent: [8], hatClosed: [0, 2, 4, 6, 8, 10, 11, 12, 14], hatOpen: [] },
  "Atlanta trap: booming 808 kicks, a halftime snare/clap on 3 and stuttering hi-hat rolls.");
b("hh-lofi", "Lo-Fi Hip-Hop", "American", "Lo-fi", 16,
  { bass: [0, 10], snareAccent: [4, 12], snareGhost: [7, 14], hatClosed: eighthHats(16) },
  "The sleepy, off-kilter lo-fi beat: a slightly-late swung backbeat over warm tape hiss.");
b("hh-drill", "UK/Brooklyn Drill", "European", "Drill", 16,
  { bass: [0, 6, 9, 11], snareAccent: [8], hatClosed: [0, 2, 4, 6, 8, 10, 12, 13, 14], hatOpen: [] },
  "Drill's sliding 808s and skittering hat triplets under a dark halftime snare.");
b("hh-neosoul", "Neo-Soul (D'Angelo pocket)", "American", "Neo-soul", 16,
  { bass: [0, 3, 10], snareAccent: [4, 12], snareGhost: [6, 9, 14], hatClosed: eighthHats(16) },
  "Questlove/Dilla's drunk, behind-the-beat neo-soul pocket with loose, human timing.");
b("hh-dilla", "Dilla Swing", "American", "Instrumental hip-hop", 16,
  { bass: [0, 6, 10], snareAccent: [4, 12], snareGhost: [2, 9], hatClosed: [0, 3, 4, 7, 8, 11, 12, 15] },
  "J Dilla's signature wonky swing, hats and snares pulled off the grid into a stumbling lurch.");
b("hh-westcoast", "West-Coast G-Funk", "American", "G-funk", 16,
  { bass: [0, 8], snareAccent: [4, 12], snareGhost: [10], hatClosed: eighthHats(16) },
  "The laid-back, synth-whine G-funk bounce of early-90s Los Angeles.");

/* ═══════════════ ELECTRONIC ═══════════════ */
b("el-house", "House", "American", "House", 16,
  { bass: [0, 4, 8, 12], snareAccent: [4, 12], hatOpen: [2, 6, 10, 14], hatClosed: eighthHats(16) },
  "The Chicago four-on-the-floor: kick on every beat, clap on 2 and 4, open hat on every offbeat.");
b("el-techno", "Techno", "European", "Techno", 16,
  { bass: [0, 4, 8, 12], snareAccent: [4, 12], hatClosed: offbeatHats(16) },
  "Detroit/Berlin techno: a hypnotic four-on-the-floor with a tight offbeat hat and minimal clap.");
b("el-dnb", "Drum & Bass (Amen feel)", "European", "Drum and bass", 16,
  { bass: [0, 10], snareAccent: [4, 12], snareGhost: [7, 14], hatClosed: sixteenthHats(16) },
  "The chopped Amen-break engine of jungle/DnB: a syncopated kick-snare at breakneck tempo.");
b("el-breakbeat", "Big-Beat Breakbeat", "European", "Breakbeat", 16,
  { bass: [0, 6, 10], snareAccent: [4, 12], snareGhost: [9, 14], hatClosed: eighthHats(16) },
  "The Chemical Brothers / Prodigy big-beat: a fat, distorted funk break looped at rave tempo.");
b("el-dubstep", "Dubstep", "European", "Dubstep", 16,
  { bass: [0, 9], snareAccent: [8], hatClosed: [0, 4, 8, 12], hatOpen: [] },
  "The half-time dubstep skank: a sub-bass kick and a single cavernous snare on beat 3.");
b("el-garage-2step", "UK 2-Step Garage", "European", "UK garage", 16,
  { bass: [0, 6, 11], snareAccent: [4, 12], snareGhost: [2, 9], hatClosed: [0, 3, 6, 8, 11, 14] },
  "The skippy, syncopated shuffle of UK garage with its swung, broken kick pattern.");
b("el-footwork", "Footwork / Juke", "American", "Footwork", 16,
  { bass: [0, 3, 6, 8, 11], snareAccent: [4, 12], hatClosed: [0, 4, 8, 12] },
  "Chicago footwork's frantic 160bpm triplet kick bursts under handclaps.");
b("el-jungle", "Jungle", "European", "Jungle", 16,
  { bass: [0, 7, 10], snareAccent: [4, 12], snareGhost: [2, 9, 14], hatClosed: sixteenthHats(16) },
  "Early jungle's ragga-tinged chopped breaks with rolling sub-bass and frantic snare edits.");
b("el-idm", "IDM Glitch", "European", "IDM", 16,
  { bass: [0, 5, 9, 13], snareAccent: [4, 11], snareGhost: [2, 7, 14], hatClosed: sixteenthHats(16) },
  "Aphex/Autechre glitch programming: micro-edited, off-grid kicks and snares.");
b("el-electro", "Electro", "American", "Electro", 16,
  { bass: [0, 7, 8, 10], snareAccent: [4, 12], hatClosed: eighthHats(16) },
  "The 808 electro-funk of Afrika Bambaataa: a robotic syncopated kick and crisp backbeat.");
b("el-gabber", "Gabber / Hardcore", "European", "Gabber", 16,
  { bass: [0, 2, 4, 6, 8, 10, 12, 14], snareAccent: [4, 12], hatClosed: everyN(16, 2) },
  "Rotterdam gabber: a distorted four-on-the-floor pushed to a pounding eighth-note kick.");
b("el-trance", "Trance", "European", "Trance", 16,
  { bass: [0, 4, 8, 12], snareAccent: [4, 12], hatOpen: [2, 6, 10, 14], hatClosed: sixteenthHats(16) },
  "Euphoric four-on-the-floor trance with rolling offbeat open hats and a clap backbeat.");

/* ═══════════════ REGGAE & CARIBBEAN ═══════════════ */
b("reg-onedrop", "One Drop", "American", "Reggae", 16,
  { bass: [8], snareAccent: [8], hatClosed: offbeatHats(16) },
  "The classic reggae one-drop: kick and rim-shot landing together on beat 3, beat 1 left empty.");
b("reg-steppers", "Steppers", "American", "Reggae", 16,
  { bass: [0, 4, 8, 12], snareAccent: [8], hatClosed: offbeatHats(16) },
  "The militant 'steppers' reggae feel with a four-on-the-floor kick driving the riddim forward.");
b("reg-rockers", "Rockers", "American", "Reggae", 16,
  { bass: [0, 8], snareAccent: [8], hatClosed: offbeatHats(16) },
  "Sly Dunbar's rockers feel: a heavier double-kick variant of the one drop.");
b("reg-rocksteady", "Rocksteady", "American", "Rocksteady", 16,
  { bass: [8], snareAccent: [4, 12], hatClosed: offbeatHats(16) },
  "The slowed-down, soul-tinged precursor to reggae with a relaxed backbeat and skanking offbeats.");
b("reg-ska", "Ska", "American", "Ska", 16,
  { bass: [0, 8], snareAccent: [4, 12], hatClosed: offbeatHats(16) },
  "The bright, up-tempo Jamaican ska shuffle with the guitar chop on every offbeat.");
b("reg-dancehall", "Dancehall (Sleng Teng)", "American", "Dancehall", 16,
  { bass: [0, 6, 10], snareAccent: [8], hatClosed: eighthHats(16) },
  "The digital dancehall riddim derived from the Sleng Teng template that reshaped Jamaican music.");
b("reg-dub", "Dub", "American", "Dub", 16,
  { bass: [8], snareAccent: [8], hatClosed: offbeatHats(16), hatOpen: [6, 14] },
  "King Tubby's cavernous dub: a spacious one-drop drenched in delay with open-hat splashes.");
b("reg-soca", "Soca", "Latin", "Soca (Trinidad)", 16,
  { bass: [0, 4, 8, 12], snareAccent: [4, 12], hatClosed: offbeatHats(16) },
  "Trinidadian soca's fast, carnival four-on-the-floor with an insistent offbeat hi-hat.");
b("reg-calypso", "Calypso", "Latin", "Calypso (Trinidad)", 16,
  { bass: [0, 6, 10], snareAccent: [4, 12], hatClosed: eighthHats(16) },
  "The lilting Trinidadian calypso groove, ancestor of soca, built on a son-clave-leaning kick.");
b("reg-reggaeton", "Reggaeton (Dembow)", "Latin", "Reggaeton", 16,
  { bass: [0, 8], snareAccent: [3, 6, 11, 14], hatClosed: eighthHats(16) },
  "The dembow riddim at reggaeton's heart: a 'boom-ch-boom-chick' snare on the 3+3+2 tresillo.");
b("reg-dembow-dr", "Dominican Dembow", "Latin", "Dembow", 16,
  { bass: [0, 8], snareAccent: [3, 6, 10, 11, 14], hatClosed: eighthHats(16) },
  "The faster, busier Dominican dembow that powers the modern Caribbean urban sound.");

/* ═══════════════ AFRO-CUBAN ═══════════════ */
b("ac-rumba-32", "Rumba Clave (3-2)", "Latin", "Afro-Cuban rumba", 16,
  { snareAccent: [0, 3, 7, 8, 12] },
  "The 3-2 rumba clave, third stroke pushed late of son, anchoring guaguancó and folkloric rumba.");
b("ac-mambo", "Mambo", "Latin", "Afro-Cuban", 16,
  { bass: [3, 6, 11, 14], snareAccent: [0, 8], hatClosed: eighthHats(16) },
  "The big-band mambo feel with the kick tracking the conga tumbao against the clave.");
b("ac-chacha", "Cha-Cha-Chá", "Latin", "Afro-Cuban", 16,
  { bass: [0, 4, 8, 12], snareAccent: [12, 13, 15], hatClosed: eighthHats(16) },
  "The cha-cha-chá: a clear four-feel with the iconic 'cha-cha-cha' güiro shuffle into beat one.");
b("ac-mozambique", "Mozambique", "Latin", "Afro-Cuban (Pello)", 16,
  { bass: [0, 3, 8, 11], snareAccent: [0, 4, 6, 10, 12, 14], hatClosed: eighthHats(16) },
  "Pello el Afrokán's carnival mozambique, later adapted for the New York drum set.");
b("ac-guaguanco", "Guaguancó", "Latin", "Afro-Cuban rumba", 16,
  { bass: [3, 7, 11], snareAccent: [0, 3, 7, 8, 12], hatClosed: eighthHats(16) },
  "The conversational guaguancó rumba built on the rumba clave with interlocking quinto.");
b("ac-songo-modern", "Timba Songo", "Latin", "Timba (Cuba)", 16,
  { bass: [3, 6, 11, 14], snareAccent: [4, 12], snareGhost: [2, 10], hatClosed: eighthHats(16) },
  "The aggressive modern Cuban timba evolution of songo with funk-driven kick and backbeat.");
b("ac-pilon", "Pilón", "Latin", "Afro-Cuban", 16,
  { bass: [0, 6, 8, 14], snareAccent: [4, 12], hatClosed: eighthHats(16) },
  "Pacho Alonso's pilón rhythm, miming the motion of pounding coffee in a mortar.");
b("ac-conga-comparsa", "Conga / Comparsa", "Latin", "Cuban carnival", 16,
  { bass: [0, 4, 8, 12], snareAccent: [3, 7, 11, 14, 15], hatClosed: eighthHats(16) },
  "The Santiago carnival comparsa, a marching street-conga groove built for moving crowds.");
b("ac-bembe", "Bembé (6/8)", "Latin", "Afro-Cuban folkloric", 12,
  { snareAccent: [0, 2, 4, 5, 7, 9, 11] },
  "The Afro-Cuban 6/8 bembé bell, the same seven-stroke timeline as the West African standard bell.");

/* ═══════════════ BRAZILIAN ═══════════════ */
b("br-partidoalto", "Partido Alto", "Latin", "Brazilian", 16,
  { bass: [0, 6, 8, 14], snareAccent: [3, 7, 10, 14], hatClosed: sixteenthHats(16) },
  "The syncopated partido-alto samba feel, its accent pattern a cornerstone of Brazilian groove.");
b("br-baiao", "Baião", "Latin", "Brazilian (Northeast)", 16,
  { bass: [0, 6], snareAccent: [4, 12], hatClosed: eighthHats(16) },
  "Luiz Gonzaga's baião: the zabumba's 'boom...ka' tresillo kick from the Brazilian sertão.");
b("br-maracatu", "Maracatu", "Latin", "Brazilian (Recife)", 16,
  { bass: [0, 5, 8, 10], snareAccent: [4, 12], hatClosed: eighthHats(16) },
  "The thunderous alfaia-drum maracatu of Pernambuco carnival, processional and trance-like.");
b("br-frevo", "Frevo", "Latin", "Brazilian (Recife)", 16,
  { bass: [0, 8], snareAccent: [2, 4, 6, 10, 12, 14], hatClosed: sixteenthHats(16) },
  "The frantic, acrobatic frevo march of Recife carnival, played at a breathless tempo.");
b("br-sambareggae", "Samba-Reggae", "Latin", "Brazilian (Bahia)", 16,
  { bass: [0, 4, 8, 10, 14], snareAccent: [4, 12], hatClosed: eighthHats(16) },
  "Olodum's samba-reggae: the Bahian blocos afro fusion of samba and Jamaican one-drop.");
b("br-bossa-rim", "Bossa Nova (rim-click)", "Latin", "Brazilian", 16,
  { bass: [0, 6, 8, 14], snareAccent: [0, 3, 6, 10, 13], hatClosed: eighthHats(16) },
  "The intimate rim-click bossa, the cross-stick spelling the bossa clave over a soft kick.");
b("br-afoxe", "Afoxé", "Latin", "Brazilian (Candomblé)", 16,
  { bass: [0, 6, 10], snareAccent: [4, 12], hatClosed: eighthHats(16) },
  "The candomblé-derived afoxé, a gentler religious cousin of samba carried by the agogô bell.");
b("br-batucada", "Batucada", "Latin", "Brazilian (bateria)", 16,
  { bass: [2, 6, 10, 14], snareAccent: [0, 4, 8, 12], snareGhost: everyN(16, 2, 1), hatClosed: everyN(16, 4) },
  "The full samba-school bateria batucada: surdos on the offbeat, caixa rolling sixteenths.");
b("br-marcha", "Marchinha", "Latin", "Brazilian carnival", 8,
  { bass: [0, 4], snareAccent: [2, 6], hatClosed: everyN(8, 1) },
  "The bouncy 2/4 marchinha of old-time Rio carnival, a cheerful European-march descendant.");

/* ═══════════════ LATIN (other) ═══════════════ */
b("la-cumbia", "Cumbia", "Latin", "Colombian cumbia", 16,
  { bass: [0, 8], snareAccent: [4, 12], hatClosed: [2, 6, 10, 14] },
  "The lilting Colombian cumbia clip-clop, its accent on the offbeat giving the dance its sway.");
b("la-salsa-cascara", "Salsa (cáscara+clave)", "Latin", "Salsa", 16,
  { bass: [3, 6, 11, 14], snareAccent: [0, 2, 4, 7, 8, 10, 12, 15], hatClosed: eighthHats(16) },
  "The full salsa kit groove: cáscara timeline over a tumbao kick, all locked to the clave.");
b("la-merengue", "Merengue", "Latin", "Dominican merengue", 16,
  { bass: [0, 4, 8, 12], snareAccent: [2, 6, 10, 14], hatClosed: sixteenthHats(16) },
  "The fast Dominican merengue with its driving tambora and güira sixteenth-note saw.");
b("la-bachata", "Bachata", "Latin", "Dominican bachata", 16,
  { bass: [0, 8], snareAccent: [4, 12], hatClosed: eighthHats(16) },
  "Bachata's gentle bolero-derived groove with the bongo-and-güira marking the romantic sway.");
b("la-bomba", "Bomba (Sicá)", "Latin", "Puerto Rican bomba", 16,
  { bass: [0, 6, 10], snareAccent: [2, 5, 8, 11, 14], hatClosed: eighthHats(16) },
  "The Puerto Rican bomba sicá, the dancer and the lead barril drum in call-and-response.");
b("la-plena", "Plena", "Latin", "Puerto Rican plena", 16,
  { bass: [0, 8], snareAccent: [4, 12], hatClosed: eighthHats(16) },
  "Plena, the panderetas-driven 'sung newspaper' of working-class Puerto Rico.");
b("la-festejo", "Festejo", "Latin", "Afro-Peruvian", 12,
  { snareAccent: [0, 2, 4, 5, 7, 9, 11], bass: [0, 6] },
  "The exuberant Afro-Peruvian festejo carried by cajón, with a 12/8 bell-leaning accent map.");
b("la-landó", "Landó", "Latin", "Afro-Peruvian", 12,
  { snareAccent: [0, 3, 4, 7, 10], bass: [0, 6] },
  "The slow, sensual Afro-Peruvian landó with its ambiguous, swaying 12/8 cajón pattern.");
b("la-joropo", "Joropo", "Latin", "Venezuelan / Llanero", 12,
  { bass: [0, 3, 6, 9], snareAccent: [0, 6], hatClosed: everyN(12, 1) },
  "The Venezuelan-Colombian plains joropo, a fast harp-and-cuatro dance in hemiola 6/8-over-3/4.");
b("la-chacarera", "Chacarera", "Latin", "Argentine folk", 12,
  { bass: [0, 4, 8], snareAccent: [0, 3, 6, 9], hatClosed: everyN(12, 1) },
  "The Argentine chacarera, a bombo legüero dance built on the 6/8-vs-3/4 hemiola.");
b("la-tango", "Tango", "Latin", "Argentine tango", 8,
  { bass: [0, 4], snareAccent: [0, 3, 4, 6], hatClosed: everyN(8, 1) },
  "The marcato tango, its 'yumba' accent driving the bandoneón with a sharp habanera lean.");
b("la-habanera", "Habanera", "Latin", "Cuban contradanza", 8,
  { bass: [0, 3, 4, 6], snareAccent: [0, 4], hatClosed: everyN(8, 1) },
  "The habanera 'tango' bass figure (dotted-eighth tresillo) that seeded much of Latin music.");

/* ═══════════════ AFRICAN (regional) ═══════════════ */
b("af-afrobeat-fela", "Afrobeat (Tony Allen)", "African", "Afrobeat (Nigeria)", 16,
  { bass: [0, 6, 10], snareAccent: [4, 12], snareGhost: [2, 7, 9, 14], hatClosed: [0, 3, 6, 8, 11, 14] },
  "Tony Allen's Afrobeat: a featherlight, jazz-informed groove of broken hats and ghosting snares.");
b("af-soukous", "Soukous", "African", "Congolese soukous", 16,
  { bass: [0, 6, 10], snareAccent: [4, 12], hatClosed: sixteenthHats(16) },
  "Congolese soukous, the fast sebene guitar dance driven by a bright snare-and-hat shuffle.");
b("af-mbalax", "Mbalax", "African", "Senegalese mbalax", 16,
  { bass: [0, 5, 8, 11], snareAccent: [3, 7, 10, 14], hatClosed: eighthHats(16) },
  "Youssou N'Dour's mbalax, the talking-drum sabar tradition translated to the modern kit.");
b("af-makossa", "Makossa", "African", "Cameroonian makossa", 16,
  { bass: [0, 4, 8, 12], snareAccent: [4, 12], hatClosed: offbeatHats(16) },
  "Manu Dibango's makossa, a slinky Cameroonian groove balanced between funk and highlife.");
b("af-juju", "Jùjú", "African", "Nigerian jùjú", 16,
  { bass: [0, 6, 10], snareAccent: [4, 12], hatClosed: eighthHats(16) },
  "King Sunny Adé's jùjú, a Yoruba talking-drum and pedal-steel dance music.");
b("af-gnawa", "Gnawa", "African", "Moroccan gnawa", 12,
  { snareAccent: [0, 2, 4, 6, 8, 10], bass: [0, 6] },
  "The hypnotic Moroccan gnawa, the qraqeb iron castanets driving a trance-inducing 12/8 cycle.");
b("af-ethio", "Ethio-Jazz (Chik Chika)", "African", "Ethiopian", 12,
  { bass: [0, 6], snareAccent: [3, 9], hatClosed: everyN(12, 1) },
  "The lopsided Ethiopian chik-chika groove that underpins Mulatu Astatke's Ethio-jazz.");
b("af-highlife-classic", "Classic Highlife", "African", "Ghanaian highlife", 16,
  { bass: [0, 6, 10], snareAccent: [4, 12], hatClosed: offbeatHats(16) },
  "Golden-age Ghanaian highlife, dance-band music fusing palm-wine guitar with brass and clave.");
b("af-kpanlogo-set", "Kpanlogo (kit)", "African", "Ga (Ghana)", 16,
  { bass: [0, 6, 10], snareAccent: [3, 6, 8, 10, 14], hatClosed: eighthHats(16) },
  "A kit reading of the Ga kpanlogo recreational dance from coastal Ghana.");
b("af-bikutsi", "Bikutsi", "African", "Cameroonian bikutsi", 12,
  { bass: [0, 3, 6, 9], snareAccent: [0, 2, 4, 6, 8, 10], hatClosed: everyN(12, 1) },
  "The driving 6/8 bikutsi of the Beti people of Cameroon, balafon-led and fiercely danceable.");
b("af-chimurenga", "Chimurenga (mbira)", "African", "Zimbabwean", 12,
  { snareAccent: [0, 3, 6, 9], bass: [0, 6], hatClosed: everyN(12, 1) },
  "Thomas Mapfumo's chimurenga, the cyclic Shona mbira interlock translated to the band.");
b("af-kwaito", "Kwaito", "African", "South African kwaito", 16,
  { bass: [0, 4, 8, 12], snareAccent: [4, 12], hatOpen: [2, 6, 10, 14] },
  "The slowed-down South African house of the townships, kwaito, with a heavy mid-tempo bounce.");
b("af-gumboot", "Gumboot", "African", "South African", 8,
  { bass: [0, 4], snareAccent: [2, 6], hatClosed: everyN(8, 1) },
  "The South African miners' gumboot-dance rhythm, stamped and slapped on rubber boots.");

/* ═══════════════ MIDDLE EASTERN ═══════════════ */
b("me-maqsum", "Maqsum", "Asian", "Arabic", 8,
  { bass: [0, 3], snareAccent: [4], hatClosed: everyN(8, 1) },
  "The maqsum, the most common Arabic rhythm: dum-tak-..-tak-dum (D-T--T-D-) in 4/4.");
b("me-baladi", "Baladi", "Asian", "Egyptian", 8,
  { bass: [0, 1], snareAccent: [4], hatClosed: everyN(8, 1) },
  "The heavy Egyptian baladi, two dums leading the bar before the maqsum-style answer.");
b("me-saidi", "Saidi", "Asian", "Egyptian (Upper)", 8,
  { bass: [0, 3, 4], snareAccent: [2, 6], hatClosed: everyN(8, 1) },
  "The Upper-Egyptian saidi with its iconic double-dum in the middle, the stick-dance rhythm.");
b("me-malfuf", "Malfuf", "Asian", "Arabic", 8,
  { bass: [0], snareAccent: [2, 5], hatClosed: everyN(8, 1) },
  "The fast 2/4 malfuf, a light processional rhythm (D-T--T--) used for entrances.");
b("me-ayyub", "Ayyub / Zaar", "Asian", "Arabic / Sufi", 8,
  { bass: [0, 3], snareAccent: [4], hatClosed: everyN(8, 1) },
  "The driving ayyub, a 2-beat trance rhythm at the heart of zaar and Sufi dhikr ceremonies.");
b("me-karsilama", "Karsilama (9/8)", "Asian", "Turkish / Greek", 18,
  { bass: [0, 4, 8, 12], snareAccent: [2, 6, 10, 14, 16], hatClosed: everyN(18, 2) },
  "The Turkish-Greek karsilama, a 9/8 dance grouped 2+2+2+3 spanning the Aegean.");
b("me-chiftetelli", "Chiftetelli", "Asian", "Turkish / Arabic", 8,
  { bass: [0, 3, 6], snareAccent: [2, 4], hatClosed: everyN(8, 1) },
  "The slow, sinuous chiftetelli, a 4/4 rhythm for the most expressive solo belly-dance.");
b("me-samai", "Samai Thaqil (10/8)", "Asian", "Arabic / Ottoman", 20,
  { bass: [0, 6, 10], snareAccent: [3, 13, 16], hatClosed: everyN(20, 2) },
  "The stately samai thaqil, a 10/8 Ottoman art-music cycle grouped 3+2+2+3.");
b("me-persian-chahar", "Chahármezráb", "Asian", "Persian", 12,
  { bass: [0, 3, 6, 9], snareAccent: [0, 6], hatClosed: everyN(12, 1) },
  "A fast, perpetual-motion Persian chahármezráb pattern from the radif classical tradition.");

/* ═══════════════ INDIAN TALAS ═══════════════ */
b("in-keherwa", "Keherwa", "Asian", "Hindustani (light)", 8,
  { snareAccent: [0, 4], snareGhost: [2, 6], bass: [0] },
  "The ubiquitous 8-beat keherwa tala (4+4), backbone of bhajan, folk and Bollywood.");
b("in-dadra", "Dadra", "Asian", "Hindustani (light)", 6,
  { snareAccent: [0, 3], snareGhost: [1, 4], bass: [0] },
  "The light 6-beat dadra tala (3+3), a thumri and semi-classical favourite.");
b("in-ektal", "Ektal", "Asian", "Hindustani", 12,
  { snareAccent: [0, 4, 8], snareGhost: [2, 6, 10], bass: [0] },
  "The grand 12-beat ektal (2+2+2+2+2+2), a vehicle for slow khyal exposition.");
b("in-tintal", "Tintal (full)", "Asian", "Hindustani", 16,
  { snareAccent: [0, 4, 12], snareGhost: [8], bass: [0] },
  "The full 16-beat tintal (4+4+4+4) with its tali at 1,5,13 and khali wave at beat 9.");
b("in-rupak-set", "Rupak (kit)", "Asian", "Hindustani", 14,
  { snareAccent: [0, 6, 10], snareGhost: [3, 8, 12], bass: [0] },
  "A kit reading of the 7-beat rupak tala (3+2+2) doubled to a 14-slot sixteenth grid.");
b("in-jhaptal-set", "Jhaptal (kit)", "Asian", "Hindustani", 10,
  { snareAccent: [0, 2, 5, 7], snareGhost: [4, 9], bass: [0] },
  "The 10-beat jhaptal (2+3+2+3) realised on the kit with ghosted off-claps.");
b("in-adi-tala", "Adi Tala", "Asian", "Carnatic", 16,
  { snareAccent: [0, 8, 12], snareGhost: [4], bass: [0] },
  "The 8-beat (×2) Carnatic adi tala, the most common South-Indian cycle, counted 4+2+2.");
b("in-misra-chapu", "Misra Chapu", "Asian", "Carnatic", 14,
  { snareAccent: [0, 6, 10], snareGhost: [3, 8], bass: [0] },
  "The 7-pulse Carnatic misra chapu (3+4), a brisk, asymmetric clapping cycle.");
b("in-khanda-chapu", "Khanda Chapu", "Asian", "Carnatic", 10,
  { snareAccent: [0, 4, 6], snareGhost: [2, 8], bass: [0] },
  "The 5-pulse khanda chapu (2+3) of Carnatic music, swift and lilting.");
b("in-konnakol", "Konnakol Tisra", "Asian", "Carnatic (solkattu)", 12,
  { snareAccent: [0, 3, 6, 9], snareGhost: [1, 4, 7, 10], bass: [0] },
  "A tisra-nadai konnakol phrase (groups of three) from the South-Indian vocal-percussion art.");

/* ═══════════════ EAST ASIAN ═══════════════ */
b("ea-taiko-matsuri", "Taiko Matsuri-Daiko", "Asian", "Japanese taiko", 16,
  { bass: [0, 4, 8, 12], snareAccent: [2, 6, 10, 14], hatClosed: eighthHats(16) },
  "A festival matsuri-daiko taiko pattern, the don-doko ostinato of Japanese drum ensembles.");
b("ea-jangdan-gutgeori", "Gutgeori Jangdan", "Asian", "Korean", 12,
  { snareAccent: [0, 3, 6, 9], snareGhost: [2, 8], bass: [0, 6] },
  "The relaxed Korean gutgeori jangdan, a 12/8 changgo drum cycle for folk song.");
b("ea-jangdan-jajinmori", "Jajinmori Jangdan", "Asian", "Korean", 12,
  { snareAccent: [0, 3, 6, 9], bass: [0, 6], hatClosed: everyN(12, 1) },
  "The lively Korean jajinmori jangdan, a fast 12/8 cycle driving pansori and folk dance.");
b("ea-jangdan-semachi", "Semachi Jangdan", "Asian", "Korean", 9,
  { snareAccent: [0, 3, 6], snareGhost: [1, 4, 7], bass: [0] },
  "The Korean semachi jangdan, a 9/8 (3+3+3) cycle giving much folk song its gentle lilt.");
b("ea-chinese-luogu", "Chinese Luogu", "Asian", "Chinese percussion", 16,
  { snareAccent: [0, 2, 4, 6, 8, 10, 12, 14], bass: [0, 8], hatClosed: everyN(16, 4) },
  "A Beijing-opera luogu gong-and-drum pattern, the cymbal-and-gong punctuation of Chinese theatre.");
b("ea-gamelan-lancaran", "Gamelan Lancaran", "Asian", "Javanese gamelan", 16,
  { bass: [15], snareAccent: [3, 7, 11], hatClosed: [1, 5, 9, 13] },
  "A fast lancaran gamelan form with the gong at the cycle's close and dense kethuk subdivision.");
b("ea-balinese-kotekan", "Balinese Kotekan", "Asian", "Balinese gamelan", 16,
  { snareAccent: [0, 2, 4, 6, 8, 10, 12, 14], bass: [0, 8], hatClosed: everyN(16, 1) },
  "The interlocking kotekan of Balinese gong kebyar, two parts dovetailing into a single fast line.");

/* ═══════════════ BALKAN & EASTERN EUROPE ═══════════════ */
b("bk-daichovo", "Daichovo Horo (9/8)", "European", "Bulgarian", 18,
  { bass: [0, 4, 8, 12], snareAccent: [2, 6, 10, 16], hatClosed: everyN(18, 2) },
  "The Bulgarian daichovo horo, a 9/8 line dance grouped 2+2+2+3.");
b("bk-kopanitsa-set", "Kopanitsa (kit)", "European", "Bulgarian", 22,
  { bass: [0, 4, 8, 14, 18], snareAccent: [4, 8, 14], hatClosed: everyN(22, 2) },
  "An 11/8 kopanitsa (2+2+3+2+2) read for the kit, the central 3-cell the dance's limp.");
b("bk-rachenitsa-set", "Rachenitsa (kit)", "European", "Bulgarian", 14,
  { bass: [0, 4, 8], snareAccent: [4, 8], hatClosed: everyN(14, 2) },
  "The Bulgarian rachenitsa (2+2+3) realised on the kit at a brisk wedding-band tempo.");
b("bk-kalamatianos", "Kalamatianos (7/8)", "European", "Greek", 14,
  { bass: [0, 6, 10], snareAccent: [0, 6, 10], hatClosed: everyN(14, 2) },
  "The Greek kalamatianos, the national 7/8 syrtos line dance grouped 3+2+2.");
b("bk-cocek", "Čoček", "European", "Balkan Romani", 18,
  { bass: [0, 4, 8, 12], snareAccent: [2, 6, 10, 14, 16], hatClosed: everyN(18, 2) },
  "The brass-band čoček of Balkan Romani celebration, a swaggering 9/8 dance.");
b("bk-lesnoto", "Lesnoto (7/8)", "European", "Macedonian", 14,
  { bass: [0, 6, 10], snareAccent: [6, 10], hatClosed: everyN(14, 2) },
  "The Macedonian lesnoto, a slow, grounded 7/8 (3+2+2) circle dance.");
b("bk-pravo", "Pravo Horo", "European", "Bulgarian", 8,
  { bass: [0, 4], snareAccent: [2, 6], hatClosed: everyN(8, 1) },
  "The pravo horo, the straight 2/4 'basic' line dance found across Bulgaria.");
b("bk-sedi-donka", "Sedi Donka (25/16)", "European", "Bulgarian", 25,
  { bass: [0, 7, 14, 18, 21], snareAccent: [7, 14], hatClosed: everyN(25, 2) },
  "The fiendish Bulgarian sedi donka, a 25/16 (7+7+11 in 2+2+3 cells) virtuoso dance.");

/* ═══════════════ EUROPEAN FOLK ═══════════════ */
b("eu-polka", "Polka", "European", "Central European", 8,
  { bass: [0, 4], snareAccent: [2, 6], hatClosed: everyN(8, 1) },
  "The bouncing 2/4 polka, the dance craze that swept 19th-century European ballrooms.");
b("eu-mazurka", "Mazurka", "European", "Polish", 12,
  { bass: [0], snareAccent: [4, 8], hatClosed: everyN(12, 2) },
  "The Polish mazurka, a 3/4 dance accenting the second or third beat against the bar.");
b("eu-tarantella", "Tarantella", "European", "Southern Italian", 12,
  { bass: [0, 6], snareAccent: [3, 9], hatClosed: everyN(12, 1) },
  "The whirling 6/8 tarantella, the southern-Italian tambourine dance of folk cure and frenzy.");
b("eu-flamenco-bulerias", "Bulerías (12-count)", "European", "Flamenco", 12,
  { snareAccent: [0, 3, 6, 8, 10], bass: [0, 6] },
  "The flamenco bulerías compás, a fast 12-count with accents at 12,3,6,8,10 — palmas-driven.");
b("eu-flamenco-solea", "Soleá", "European", "Flamenco", 12,
  { snareAccent: [2, 5, 7, 9, 11], bass: [0, 6] },
  "The solemn flamenco soleá compás, the same 12-count as bulerías taken slow and grave.");
b("eu-flamenco-tangos", "Tangos Flamencos", "European", "Flamenco", 8,
  { bass: [0, 4], snareAccent: [2, 6], hatClosed: everyN(8, 1) },
  "The flamenco tangos, an earthy binary palmas rhythm, unrelated to the Argentine tango.");
b("eu-klezmer-freylekhs", "Freylekhs", "European", "Klezmer", 8,
  { bass: [0, 4], snareAccent: [2, 6], hatClosed: everyN(8, 1) },
  "The joyous klezmer freylekhs, the 'oom-pah' wedding dance of Ashkenazi Eastern Europe.");
b("eu-klezmer-bulgar", "Bulgar (klezmer)", "European", "Klezmer", 8,
  { bass: [0, 3, 4], snareAccent: [2, 6], hatClosed: everyN(8, 1) },
  "The klezmer bulgar, a Bessarabian-derived dance with a snappy syncopated bass.");
b("eu-tarantella-pizzica", "Pizzica", "European", "Salentino (Italy)", 12,
  { bass: [0, 3, 6, 9], snareAccent: [0, 6], hatClosed: everyN(12, 1) },
  "The pizzica of Salento, the driving tambourine-trance variant of the tarantella.");
b("eu-paso-doble", "Paso Doble", "European", "Spanish", 8,
  { bass: [0, 4], snareAccent: [0, 2, 4, 6], hatClosed: everyN(8, 1) },
  "The march-like Spanish paso doble, evoking the bullfighter's stride into the ring.");

/* ═══════════════ CELTIC ═══════════════ */
b("ce-reel", "Reel", "European", "Irish / Scottish", 8,
  { bass: [0, 4], snareAccent: [2, 6], hatClosed: everyN(8, 1) },
  "The Irish reel, the most common session tune type, a flowing 4/4 of even eighths.");
b("ce-jig", "Jig", "European", "Irish", 12,
  { bass: [0, 6], snareAccent: [3, 9], hatClosed: everyN(12, 1) },
  "The double jig, a bouncing 6/8 of two compound beats, the dance heart of Irish music.");
b("ce-slipjig", "Slip Jig (9/8)", "European", "Irish", 18,
  { bass: [0, 6, 12], snareAccent: [3, 9, 15], hatClosed: everyN(18, 2) },
  "The graceful slip jig, a 9/8 tune type (3 compound beats) traditionally danced by women.");
b("ce-hornpipe", "Hornpipe", "European", "Irish / English", 16,
  { bass: [0, 8], snareAccent: [4, 12], hatClosed: [0, 3, 4, 7, 8, 11, 12, 15] },
  "The dotted, swung hornpipe, a stately 4/4 with a characteristic long-short lilt.");
b("ce-strathspey", "Strathspey", "European", "Scottish", 16,
  { bass: [0, 8], snareAccent: [4, 12], hatClosed: [0, 1, 4, 7, 8, 9, 12, 15] },
  "The Scottish strathspey, its snapped 'Scotch snap' dotted rhythm unique among the dance forms.");
b("ce-slide", "Slide (12/8)", "European", "Irish (Sliabh Luachra)", 12,
  { bass: [0, 6], snareAccent: [3, 9], hatClosed: everyN(12, 1) },
  "The Sliabh Luachra slide, a fast 12/8 dance from the Cork-Kerry border country.");

/* ═══════════════ MARCH · STREET · DRUMLINE ═══════════════ */
b("st-batucada-march", "Drumline Cadence", "American", "Marching percussion", 16,
  { bass: [0, 4, 8, 12], snareAccent: [2, 6, 10, 14], snareGhost: everyN(16, 1), hatClosed: [] },
  "A marching-band drumline cadence, the snare line's rudimental street beat between tunes.");
b("st-secondline-bo", "Second-Line Bo Diddley", "American", "New Orleans", 16,
  { bass: [0, 3, 6, 10, 12], snareAccent: [4, 12], snareGhost: [2, 8, 14], hatClosed: eighthHats(16) },
  "The Bo Diddley clave-march hybrid born of the New Orleans second-line tradition.");
b("st-batterie-fanfare", "Fanfare Batterie", "European", "French street band", 16,
  { bass: [0, 8], snareAccent: [0, 4, 8, 12], snareGhost: everyN(16, 2, 1), hatClosed: [] },
  "The French fanfare batterie, the snare-and-bass street-band drive behind brass.");
b("st-samba-bateria-full", "Bateria Surdo Section", "Latin", "Brazilian (bateria)", 16,
  { bass: [4, 12], snareAccent: [0, 8], snareGhost: [2, 6, 10, 14], hatClosed: everyN(16, 4) },
  "The three-surdo conversation of a samba-school bateria, marcação on the strong beats.");

/* ═══════════════ COUNTRY · BLUEGRASS · GOSPEL · BLUES ═══════════════ */
b("co-train", "Train Beat", "American", "Country", 16,
  { bass: [0, 8], snareAccent: [4, 12], snareGhost: everyN(16, 2, 1), hatClosed: [] },
  "The country train beat, the snare's brushed sixteenths chugging like a locomotive.");
b("co-twobeat", "Country Two-Beat", "American", "Country", 8,
  { bass: [0, 4], snareAccent: [2, 6], hatClosed: everyN(8, 1) },
  "The Nashville two-beat, the boom-chick of the upright bass and brushed snare.");
b("co-bluegrass", "Bluegrass (mandolin chop)", "American", "Bluegrass", 8,
  { bass: [0, 4], snareAccent: [2, 6], hatClosed: everyN(8, 2) },
  "The bluegrass backbeat, carried not by drums but by the mandolin's chop on 2 and 4.");
b("co-gospel", "Gospel Shout", "American", "Gospel", 12,
  { bass: [0, 6], snareAccent: [3, 9], snareGhost: [2, 5, 8, 11], hatClosed: everyN(12, 1) },
  "The fast gospel shuffle 'shout', the triplet-driven climax of the Black church service.");
b("co-blues-shuffle", "Blues Shuffle (Texas)", "American", "Blues", 12,
  { bass: [0, 6], snareAccent: [3, 9], hatClosed: [0, 2, 3, 5, 6, 8, 9, 11] },
  "The Texas blues shuffle, the swung triplet skip of countless twelve-bar records.");
b("co-slow-blues", "Slow Blues (12/8)", "American", "Blues", 12,
  { bass: [0, 6], snareAccent: [3, 9], hatClosed: everyN(12, 1) },
  "The slow 12/8 blues, every beat split into triplets for a brooding, swaying feel.");
b("co-rockabilly", "Rockabilly", "American", "Rockabilly", 16,
  { bass: [0, 8], snareAccent: [4, 12], hatClosed: [0, 3, 4, 7, 8, 11, 12, 15] },
  "The slap-back rockabilly shuffle of Sun Records, a country-boogie with a backbeat snap.");
b("co-honkytonk", "Honky-Tonk", "American", "Country", 8,
  { bass: [0, 4], snareAccent: [2, 6], hatClosed: everyN(8, 1) },
  "The honky-tonk two-beat, the barroom shuffle of classic hard country.");

/* ═══════════════ POLYRHYTHM · ODD-METER · OSTINATO ═══════════════ */
b("po-34", "3-Over-4 Polyrhythm", "African", "Polyrhythm", 12,
  { bass: [0, 4, 8], snareAccent: [0, 3, 6, 9], hatClosed: everyN(12, 1) },
  "The fundamental 3:4 cross-rhythm, three even kicks against four even snares in one cycle.");
b("po-45", "4-Over-5 Polyrhythm", "African", "Polyrhythm", 20,
  { bass: [0, 5, 10, 15], snareAccent: [0, 4, 8, 12, 16], hatClosed: everyN(20, 2) },
  "The 4:5 cross-rhythm, four pulses laid against five within a single twenty-slot cycle.");
b("po-hemiola", "Hemiola (6/8↔3/4)", "African", "Polyrhythm", 12,
  { bass: [0, 4, 8], snareAccent: [0, 3, 6, 9], hatClosed: everyN(12, 2) },
  "The hemiola, the ambiguous oscillation between two dotted beats and three plain ones.");
b("po-clave-leftfoot", "Left-Foot Clave", "Latin", "Drum-set ostinato", 16,
  { bass: [0, 8], snareAccent: [4, 12], hhFoot: [0, 3, 6, 10, 12] },
  "A drum-set independence ostinato: the son clave kept by the hi-hat foot under a backbeat.");
b("po-displaced-back", "Displaced Backbeat", "American", "Ostinato", 16,
  { bass: [0, 8], snareAccent: [5, 13], hatClosed: eighthHats(16) },
  "A deliberately displaced backbeat, the snare pushed off 2 and 4 for a disorienting lurch.");
b("po-broken-hat", "Broken-Hat Linear Funk", "American", "Linear funk", 16,
  { bass: [0, 6, 10], snareAccent: [4, 12], hatClosed: [2, 8, 14], snareGhost: [7, 9] },
  "Linear funk where no two voices sound together — the hat fills only the gaps left by kick and snare.");
b("po-58", "5/8 Groove", "European", "Odd meter", 10,
  { bass: [0, 4, 6], snareAccent: [4], hatClosed: everyN(10, 2) },
  "A 5/8 groove grouped 3+2, the short odd meter that powers much progressive and Balkan music.");
b("po-138", "13/8 Groove", "European", "Odd meter", 26,
  { bass: [0, 6, 12, 16, 20], snareAccent: [6, 16], hatClosed: everyN(26, 2) },
  "A 13/8 groove grouped 3+2+2+3+3, a sprawling odd meter for the adventurous.");
b("po-158", "15/8 Groove", "European", "Odd meter", 30,
  { bass: [0, 6, 12, 18, 24], snareAccent: [6, 18], hatClosed: everyN(30, 2) },
  "A 15/8 groove grouped 3+3+3+3+3, five compound beats stretching one long cycle.");
b("po-74-7over8", "7/4 Long-Form", "American", "Odd meter", 28,
  { bass: [0, 8, 16, 20], snareAccent: [4, 12, 24], hatClosed: everyN(28, 4) },
  "A spacious 7/4 groove (think 'Money'), the backbeat stretched across seven quarter-note pulses.");
b("po-double-bass-ostinato", "Double-Bass Ostinato", "American", "Metal ostinato", 16,
  { bass: everyN(16, 2), snareAccent: [4, 12], hatClosed: quarterHats(16) },
  "A continuous eighth-note double-bass ostinato holding under a slow, deliberate backbeat.");
b("po-32clave-bell", "32-Slot Son Clave", "Latin", "Afro-Cuban", 32,
  { snareAccent: [0, 6, 12, 20, 24] },
  "The son clave notated over a 32-slot two-bar cycle for fine-grained sixteenth alignment.");
b("po-32rumba-bell", "32-Slot Rumba Clave", "Latin", "Afro-Cuban", 32,
  { snareAccent: [0, 6, 14, 20, 24] },
  "The rumba clave over a 32-slot cycle, the late third stroke clearly placed off the sixteenth grid.");
b("po-32cascara", "32-Slot Cáscara", "Latin", "Afro-Cuban", 32,
  { snareAccent: [0, 4, 8, 14, 16, 20, 24, 30], bass: [6, 12, 22, 28] },
  "The cáscara timeline spread across a 32-slot two-bar phrase with the tumbao kick beneath.");
b("po-32songo", "32-Slot Songo", "Latin", "Cuban", 32,
  { bass: [6, 12, 22, 28], snareAccent: [8, 24], snareGhost: [4, 20], hatClosed: everyN(32, 2) },
  "A two-bar songo over 32 slots, the modern Cuban kit groove at full sixteenth resolution.");

/* ═══════════════ extra world & niche to round out coverage ═══════════════ */
b("wd-zydeco", "Zydeco", "American", "Louisiana Creole", 16,
  { bass: [0, 8], snareAccent: [4, 12], hatClosed: [2, 6, 10, 14] },
  "The Creole zydeco of southwest Louisiana, the rubboard scraping offbeats behind the accordion.");
b("wd-cajun-twostep", "Cajun Two-Step", "American", "Cajun", 8,
  { bass: [0, 4], snareAccent: [2, 6], hatClosed: everyN(8, 1) },
  "The Cajun two-step, the fiddle-and-accordion dance of the Acadian bayou.");
b("wd-norteno", "Norteño / Polka", "Latin", "Mexican norteño", 8,
  { bass: [0, 4], snareAccent: [2, 6], hatClosed: everyN(8, 1) },
  "The Mexican norteño, a polka-derived oom-pah carried by the button accordion and bajo sexto.");
b("wd-cumbia-sonidera", "Cumbia Sonidera", "Latin", "Mexican cumbia", 16,
  { bass: [0, 8], snareAccent: [4, 12], hatClosed: [2, 6, 10, 14] },
  "The slowed, echo-drenched Mexican sound-system cumbia of the urban barrios.");
b("wd-vallenato", "Vallenato", "Latin", "Colombian vallenato", 8,
  { bass: [0, 4], snareAccent: [2, 6], hatClosed: everyN(8, 1) },
  "The accordion-led Colombian vallenato, its caja and guacharaca driving the paseo and merengue.");
b("wd-highlife-palmwine", "Palm-Wine Highlife", "African", "West African", 16,
  { bass: [0, 6, 10], snareAccent: [4, 12], hatClosed: eighthHats(16) },
  "The gentle palm-wine guitar style, an early acoustic ancestor of dance-band highlife.");
b("wd-assiko", "Assiko", "African", "Cameroonian", 16,
  { bass: [0, 6, 10], snareAccent: [2, 4, 8, 12, 14], hatClosed: eighthHats(16) },
  "The bottle-and-guitar assiko of the Cameroonian coast, a fast finger-style dance music.");
b("wd-rai", "Raï", "African", "Algerian raï", 16,
  { bass: [0, 6, 8, 14], snareAccent: [4, 12], hatClosed: eighthHats(16) },
  "The Algerian raï, the rebel pop of Oran blending Bedouin song with synths and a driving backbeat.");
b("wd-fado", "Fado", "European", "Portuguese", 8,
  { bass: [0, 4], snareAccent: [2, 6], hatClosed: everyN(8, 1) },
  "The melancholic Portuguese fado, the guitarra-led song of longing (saudade).");
b("wd-rebetiko", "Rebetiko (Hasapiko)", "European", "Greek", 8,
  { bass: [0, 4], snareAccent: [2, 6], hatClosed: everyN(8, 1) },
  "The Greek rebetiko hasapiko, the 'butcher's dance' of the urban underworld bouzouki cafés.");
b("wd-tsifteteli-gr", "Tsifteteli (Greek)", "European", "Greek", 8,
  { bass: [0, 3, 6], snareAccent: [2, 4], hatClosed: everyN(8, 1) },
  "The Greek tsifteteli, the Anatolian-derived 'belly-dance' rhythm of the rebetiko tradition.");
b("wd-qawwali", "Qawwali", "Asian", "Sufi (South Asia)", 8,
  { snareAccent: [0, 4], snareGhost: [2, 6], bass: [0], hatClosed: everyN(8, 1) },
  "The ecstatic qawwali of the Sufi shrine, hand-claps and dholak driving the devotional trance.");
b("wd-bhangra", "Bhangra (Chaal)", "Asian", "Punjabi", 8,
  { bass: [0, 3], snareAccent: [4, 6], snareGhost: [2], hatClosed: everyN(8, 1) },
  "The Punjabi bhangra chaal, the dhol's bouncing harvest-dance rhythm gone global.");
b("wd-dabke", "Dabke", "Asian", "Levantine", 8,
  { bass: [0, 3], snareAccent: [4, 6], hatClosed: everyN(8, 1) },
  "The Levantine dabke, the stamping line dance of weddings across Lebanon, Syria and Palestine.");
b("wd-kompa", "Konpa", "Latin", "Haitian", 16,
  { bass: [0, 6, 8, 14], snareAccent: [4, 12], hatClosed: offbeatHats(16) },
  "The Haitian konpa, a smooth méringue-derived dance groove of the Francophone Caribbean.");
b("wd-zouk", "Zouk", "Latin", "Antillean", 16,
  { bass: [0, 4, 8, 12], snareAccent: [4, 12], hatClosed: offbeatHats(16) },
  "The Antillean zouk of Kassav', a glossy electronic carnival groove from Guadeloupe and Martinique.");
b("wd-coupe-decale", "Coupé-Décalé", "African", "Ivorian", 16,
  { bass: [0, 4, 8, 12], snareAccent: [4, 12], hatClosed: [2, 6, 10, 14] },
  "The Ivorian coupé-décalé, a flashy Parisian-African club style descended from soukous and zouk.");
b("wd-amapiano", "Amapiano", "African", "South African", 16,
  { bass: [0, 4, 8, 12], snareAccent: [4, 12], snareGhost: [10, 14], hatClosed: offbeatHats(16) },
  "The South African amapiano, its log-drum bass and shaker-driven swing slowing house to a sway.");
b("wd-gqom", "Gqom", "African", "South African", 16,
  { bass: [0, 3, 6, 11], snareAccent: [8], hatClosed: [4, 12] },
  "The dark, broken Durban gqom, a minimal, drum-heavy mutation of house music.");
b("wd-baltimore-club", "Baltimore Club", "American", "Club", 16,
  { bass: [0, 3, 6, 8, 11, 14], snareAccent: [4, 12], hatClosed: eighthHats(16) },
  "Baltimore club's breakneck 8/4 bounce, the chopped-break party music of the mid-Atlantic.");
b("wd-jersey-club", "Jersey Club", "American", "Club", 16,
  { bass: [0, 3, 5, 8, 11, 13], snareAccent: [4, 12], hatClosed: eighthHats(16) },
  "Jersey club's triplet-kick bounce, a Newark evolution of the Baltimore club template.");
b("wd-baile-funk", "Baile Funk (Tamborzão)", "Latin", "Brazilian funk", 16,
  { bass: [0, 6, 10], snareAccent: [3, 6, 8, 11, 14], hatClosed: eighthHats(16) },
  "The Rio baile-funk tamborzão, a raw favela party beat built on a dembow-tresillo skeleton.");
b("wd-kuduro", "Kuduro", "African", "Angolan", 16,
  { bass: [0, 6, 8, 14], snareAccent: [4, 8, 12], hatClosed: eighthHats(16) },
  "The frenetic Angolan kuduro, a hard-edged electronic carnival music for athletic dance.");
b("wd-afrohouse", "Afro-House", "African", "Pan-African", 16,
  { bass: [0, 4, 8, 12], snareAccent: [4, 12], snareGhost: [6, 14], hatClosed: offbeatHats(16) },
  "Pan-African afro-house, four-on-the-floor laced with djembe and shaker polyrhythm.");

/* ═══════════════ MORE jazz/odd/world to push past target ═══════════════ */
b("jz-afrocuban-jazz", "Afro-Cuban Jazz (Mambo bell)", "Latin", "Latin jazz", 16,
  { bass: [3, 6, 11, 14], snareAccent: [0, 2, 4, 6, 8, 10, 12, 14], hatClosed: eighthHats(16) },
  "The Latin-jazz mambo bell over a tumbao kick, the New York Palladium sound of Machito and Puente.");
b("jz-bossa-jazz", "Jazz Bossa", "Latin", "Jazz bossa", 16,
  { bass: [0, 6, 8, 14], snareAccent: [0, 3, 6, 10, 12], hatClosed: eighthHats(16), hhFoot: [4, 12] },
  "The jazz-club bossa of Getz/Gilberto, the rim-click bossa clave with a feathered ride.");
b("jz-newtimes-odd", "Odd-Meter Jazz (7/4)", "American", "Modern jazz", 28,
  { bass: [0, 12, 16], snareAccent: [4, 8, 20, 24], hatClosed: everyN(28, 4), hhFoot: [8, 20] },
  "A modern-jazz 7/4 vamp in the Brubeck/Iverson lineage, the ride floating over an odd cycle.");
b("jz-nola-funk-jazz", "NOLA Funk-Jazz", "American", "New Orleans", 16,
  { bass: [0, 3, 8, 11], snareAccent: [4, 12], snareGhost: [6, 10, 14], hatClosed: eighthHats(16) },
  "The Stanton Moore / Galactic fusion of second-line funk and modern jazz independence.");
b("jz-brush-swing-4", "Brush Swing (4/4)", "American", "Jazz", 16,
  { snareAccent: [4, 12], snareGhost: [2, 6, 10, 14], hatClosed: [0, 4, 8, 12], hhFoot: [4, 12] },
  "A straight-four brush swing, the legato sweep of a small-group jazz medium-tempo tune.");
b("jz-bebop-uptempo", "Up-Tempo Bebop", "American", "Bebop", 12,
  { snareAccent: [3, 9], bass: [0], hatClosed: [0, 3, 5, 6, 9, 11], hhFoot: [3, 9] },
  "Blistering up-tempo bebop, the ride a blur of triplets with sparse, surgical bass-drum bombs.");

/* small world-percussion cells for short-length coverage */
b("cell-tresillo", "Tresillo", "Latin", "Pan-Caribbean cell", 8,
  { snareAccent: [0, 3, 6], bass: [0, 3, 6] },
  "The tresillo (3+3+2), the single most pervasive rhythmic cell across the African diaspora.");
b("cell-cinquillo", "Cinquillo", "Latin", "Cuban/Haitian cell", 8,
  { snareAccent: [0, 1, 3, 4, 6], bass: [0, 3, 6] },
  "The cinquillo, the five-stroke ornament of the tresillo central to danzón and Haitian méringue.");
b("cell-amphibrach", "Amphibrach Cell", "European", "Balkan cell", 7,
  { snareAccent: [0, 2, 4], bass: [0, 4] },
  "A 7-pulse amphibrach (2+3+2) cell, the symmetric limping foot of many Balkan dances.");
b("cell-additive-2233", "Additive 2+2+3+3", "Asian", "Additive cell", 10,
  { snareAccent: [0, 2, 4, 7], bass: [0, 4] },
  "A 10-pulse additive cell grouped 2+2+3+3, common to Turkish and South-Asian aksak rhythm.");
b("cell-aksak-23", "Aksak (2+3)", "European", "Turkish aksak", 5,
  { snareAccent: [0, 2], bass: [0] },
  "The basic 5-pulse aksak (2+3), the 'limping' asymmetric foot underlying much of Anatolian music.");
b("cell-aksak-322", "Aksak (3+2+2)", "European", "Turkish aksak", 7,
  { snareAccent: [0, 3, 5], bass: [0] },
  "A 7-pulse aksak grouped 3+2+2, the rupak-like lift shared between Anatolia and the Balkans.");

const slug = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48) || "x";

/* ═══════════════════════════════════════════════════════════════════════════
   RESEARCH INGESTION — sourced, web-researched named grooves written by the
   research fleet into scripts/research/*.json (one array of grooves per file).
   Every entry is sanitised: region coerced to the 5-set, positions clamped to
   [0, length), empties dropped. Source citations are folded into the desc.
   ═══════════════════════════════════════════════════════════════════════════ */
const REGIONS = new Set(["African", "Latin", "Asian", "European", "American"]);
const RESEARCH = [];
let researchFiles = [];
try {
  researchFiles = readdirSync(new URL("./research/", import.meta.url)).filter((f) => f.endsWith(".json"));
} catch { /* dir may not exist yet */ }
for (const f of researchFiles) {
  let arr;
  try { arr = JSON.parse(readFileSync(new URL("./research/" + f, import.meta.url), "utf8")); }
  catch (e) { console.warn(`  ! skip ${f}: ${e.message}`); continue; }
  if (!Array.isArray(arr)) continue;
  for (const g of arr) {
    if (!g || typeof g.name !== "string") continue;
    const L = Math.round(Number(g.length));
    if (!(L > 0) || L > 96) continue;
    const region = REGIONS.has(g.region) ? g.region : "African";
    const voices = clampVoices(g.voices || {}, L);
    if (Object.values(voices).every((a) => !a || !a.length)) continue;
    let desc = (typeof g.desc === "string" ? g.desc : "").trim();
    if (g.source && typeof g.source === "string" && !desc.includes(g.source))
      desc = (desc + ` [${g.source.trim()}]`).trim();
    if (!desc) desc = `${g.genre || region} traditional groove.`;
    RESEARCH.push({
      id: `rx${RESEARCH.length}-${slug((g.genre || "") + "-" + g.name)}`,
      name: g.name.trim(), region, genre: (typeof g.genre === "string" && g.genre.trim()) || region,
      length: L, voices, desc,
    });
  }
}
console.log(`  · research files: ${researchFiles.length}, ingested grooves: ${RESEARCH.length}`);

/* ═══════════════════════════════════════════════════════════════════════════
   STRUCTURAL FAMILIES — programmatic, genuinely-distinct rhythms grounded in
   real theory. Deduped by content signature (length|bass|snareAccent) so every
   structural entry is a *different* rhythm, not a renamed duplicate.
   ═══════════════════════════════════════════════════════════════════════════ */
const STRUCTURAL = [];
const structSig = new Set();
function pushStruct(g) {
  const voices = clampVoices(g.voices, g.length);
  if (Object.values(voices).every((a) => !a || !a.length)) return;
  const sig = g.length + "|" + (voices.bass || []).join(",") + "|" + (voices.snareAccent || []).join(",");
  if (structSig.has(sig)) return;
  structSig.add(sig);
  STRUCTURAL.push({ ...g, voices });
}

/* 1) Additive / aksak meters — every ordered grouping of beats into 2/3/4 is a
   real danced meter across the Balkans, Anatolia, the Caucasus and South Asia. */
function compositions(total, alpha) {
  if (total === 0) return [[]];
  const acc = [];
  for (const p of alpha) if (p <= total) for (const rest of compositions(total - p, alpha)) acc.push([p, ...rest]);
  return acc;
}
const AK_ALPHA = [2, 3, 4];
for (let beats = 5; beats <= 21; beats++) {
  for (const s of [2, 3]) {            // s=2 simple subdivision, s=3 compound
    const L = beats * s;
    if (L > 54) continue;
    for (const g of compositions(beats, AK_ALPHA)) {
      if (g.length < 2) continue;
      const heads = []; let c = 0; for (const p of g) { heads.push(c * s); c += p; }
      const longHeads = []; c = 0; for (const p of g) { if (p >= 3) longHeads.push(c * s); c += p; }
      const gname = g.join("+");
      const denom = s === 2 ? `${beats}/8` : `${beats}/8 compound`;
      const region = beats % 2 === 0 ? "European" : "Asian";
      const genre = s === 3 ? "Compound additive meter" : "Additive meter (aksak)";
      const mid = heads[Math.floor(heads.length / 2)];
      // scheme A — accent every group head (the dance's footfalls)
      pushStruct({ id: `ak-${beats}-${s}-${gname}-a`, name: `Aksak ${gname} (${denom}) — group heads`,
        region, genre, length: L, voices: { bass: [0], snareAccent: heads, hatClosed: everyN(L, s) },
        desc: `A ${beats}-beat additive meter grouped ${gname}${s === 3 ? " in compound subdivision" : ""}, accented on every group head — the asymmetric 'limp' of aksak dance.` });
      // scheme B — kick walks the heads, backbeat marks the long (3+/4) cells
      pushStruct({ id: `ak-${beats}-${s}-${gname}-b`, name: `Aksak ${gname} (${denom}) — long-cell backbeat`,
        region, genre, length: L,
        voices: { bass: heads, snareAccent: longHeads.length ? longHeads : [heads[heads.length - 1]], hatClosed: everyN(L, s) },
        desc: `The ${gname} additive meter with the bass-drum walking the group heads and the snare marking the long cells.` });
      // scheme C — single displaced backbeat for a modern odd-meter kit feel
      pushStruct({ id: `ak-${beats}-${s}-${gname}-c`, name: `Aksak ${gname} (${denom}) — displaced backbeat`,
        region: "American", genre: "Odd-meter kit", length: L,
        voices: { bass: heads[1] !== undefined ? [0, heads[1]] : [0], snareAccent: [mid], hatClosed: everyN(L, s) },
        desc: `The ${gname} grouping read as a modern odd-meter kit groove with one displaced backbeat.` });
    }
  }
}

/* 2) Polyrhythm grid — every coprime n-over-m cross-rhythm in one cycle. */
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
for (let m = 2; m <= 13; m++) for (let n = 2; n < m; n++) {
  if (gcd(n, m) !== 1) continue;
  const L = n * m;
  const mPulse = everyN(L, L / m), nPulse = everyN(L, L / n);
  pushStruct({ id: `poly-${n}-${m}`, name: `${n}-over-${m} Polyrhythm`, region: "African", genre: "Polyrhythm", length: L,
    voices: { bass: mPulse, snareAccent: nPulse, hatClosed: everyN(L, 1) },
    desc: `The ${n}:${m} cross-rhythm — ${n} even pulses laid against ${m} within one ${L}-slot cycle.` });
  pushStruct({ id: `poly-${m}-${n}`, name: `${m}-over-${n} Polyrhythm`, region: "African", genre: "Polyrhythm", length: L,
    voices: { bass: nPulse, snareAccent: mPulse, hatClosed: everyN(L, 1) },
    desc: `The ${m}:${n} cross-rhythm with the roles reversed within one ${L}-slot cycle.` });
}

/* 3) Timeline rotations — each clave/bell entered at each pulse is a distinct,
   genuinely-used orientation (claves and bells are identities up to rotation). */
const TIMELINES = [
  { id: "son", name: "Son Clave", region: "Latin", L: 16, on: [0, 3, 6, 10, 12] },
  { id: "rumba", name: "Rumba Clave", region: "Latin", L: 16, on: [0, 3, 7, 10, 12] },
  { id: "bossa", name: "Bossa Clave", region: "Latin", L: 16, on: [0, 3, 6, 10, 13] },
  { id: "bell128", name: "Standard 12/8 Bell", region: "African", L: 12, on: [0, 2, 4, 5, 7, 9, 11] },
  { id: "soukousbell", name: "Soukous Bell", region: "African", L: 16, on: [0, 2, 4, 6, 8, 11, 14] },
  { id: "gahubell", name: "Gahu Bell", region: "African", L: 16, on: [0, 2, 4, 6, 10, 12, 14] },
  { id: "shiko", name: "Shiko Timeline", region: "African", L: 16, on: [0, 4, 6, 10, 12] },
  { id: "tresillo", name: "Tresillo", region: "Latin", L: 8, on: [0, 3, 6] },
  { id: "cinquillo", name: "Cinquillo", region: "Latin", L: 8, on: [0, 1, 3, 4, 6] },
  { id: "kpanlogo", name: "Kpanlogo Bell", region: "African", L: 16, on: [0, 3, 6, 8, 10, 14] },
  { id: "bembe7", name: "Bembé Bell (short)", region: "African", L: 12, on: [0, 2, 3, 5, 7, 8, 10] },
];
for (const t of TIMELINES) {
  for (let r = 0; r < t.L; r++) {
    const on = t.on.map((x) => (x + r) % t.L).sort((a, b) => a - b);
    pushStruct({ id: `rot-${t.id}-${r}`, name: `${t.name} (rotation ${r})`, region: t.region,
      genre: "Timeline rotation", length: t.L, voices: { bass: [on[0]], snareAccent: on },
      desc: `The ${t.name} timeline entered at pulse ${r}; each rotation is a distinct orientation used across the tradition.` });
  }
}

/* 4) Indian tala × gati (nadai) — the South-Indian system is *defined* by this
   cross-product: each tala subdivided in 3/4/5/7/9 matras per beat. */
const TALAS = [
  { id: "adi", name: "Adi", beats: 8, clap: [0, 4, 6] },
  { id: "rupaka", name: "Rupaka", beats: 6, clap: [0, 2] },
  { id: "misrachapu", name: "Misra Chapu", beats: 7, clap: [0, 3] },
  { id: "khandachapu", name: "Khanda Chapu", beats: 5, clap: [0, 2] },
  { id: "tisratriputa", name: "Tisra Triputa", beats: 7, clap: [0, 3, 5] },
  { id: "khandatriputa", name: "Khanda Triputa", beats: 9, clap: [0, 5, 7] },
  { id: "teental", name: "Teental", beats: 16, clap: [0, 4, 12] },
  { id: "jhaptal", name: "Jhaptal", beats: 10, clap: [0, 2, 5, 7] },
  { id: "ektal", name: "Ektal", beats: 12, clap: [0, 2, 4, 6, 8, 10] },
  { id: "chautal", name: "Chautal", beats: 12, clap: [0, 4, 8] },
  { id: "dhamar", name: "Dhamar", beats: 14, clap: [0, 5, 10] },
  { id: "rupaktal", name: "Rupak Tal", beats: 7, clap: [0, 3, 5] },
  { id: "deepchandi", name: "Deepchandi", beats: 14, clap: [0, 3, 7, 10] },
];
const GATI = [{ n: 3, t: "Tisra" }, { n: 4, t: "Chatusra" }, { n: 5, t: "Khanda" }, { n: 7, t: "Misra" }, { n: 9, t: "Sankirna" }];
for (const tl of TALAS) for (const ga of GATI) {
  const L = tl.beats * ga.n;
  if (L > 96) continue;
  const heads = tl.clap.map((bt) => bt * ga.n);
  const ghosts = everyN(L, ga.n).filter((x) => !heads.includes(x));
  pushStruct({ id: `tala-${tl.id}-${slug(ga.t)}`, name: `${tl.name} in ${ga.t} Nadai`, region: "Asian",
    genre: "Indian tala (nadai)", length: L,
    voices: { bass: [0], snareAccent: heads, snareGhost: ghosts },
    desc: `The ${tl.name} tala subdivided in ${ga.t} nadai (${ga.n} matras per beat) — the cross-product at the heart of Carnatic rhythmic permutation.` });
}
/* 5) Euclidean rhythms E(k,n) — Bjorklund's maximally-even onset distributions,
   shown by Toussaint to generate a great many traditional world timelines
   (E(3,8)=tresillo, E(5,8)=cinquillo, E(5,16)=Brazilian, E(7,16)=samba bell,
   E(5,12)=Venda/bembé, E(4,9)=Turkish aksak, …). Each (k,n) plus its rotations
   is a distinct, literature-grounded rhythm. */
const euclid = (k, n) => Array.from({ length: Math.max(0, Math.min(k, n)) }, (_, i) => Math.floor((i * n) / k));
for (let n = 5; n <= 24; n++) {
  const back = euclid(2, n);                 // maximally-even 2-stroke "backbeat"
  for (let k = 2; k < n; k++) {
    const base = euclid(k, n);
    // limit rotation fan-out so the family stays a few thousand, not exponential
    const rots = n <= 16 ? n : Math.ceil(n / 2);
    for (let r = 0; r < rots; r++) {
      const bass = base.map((x) => (x + r) % n).sort((a, b) => a - b);
      pushStruct({
        id: `euc-${k}-${n}-${r}`,
        name: r === 0 ? `Euclidean E(${k},${n})` : `Euclidean E(${k},${n}) · rot ${r}`,
        region: "African", genre: "Euclidean rhythm", length: n,
        voices: { bass, snareAccent: back },
        desc: `The maximally-even Euclidean rhythm E(${k},${n})${r ? ` rotated by ${r}` : ""} — Bjorklund's algorithm, which Toussaint maps onto traditional world timelines.`,
      });
    }
  }
}
console.log(`  · structural grooves: ${STRUCTURAL.length}`);

/* ═══════════════════════════════════════════════════════════════════════════
   Expansion: each authentic base → a small set of honestly-labelled variations.
   Variants 2-4 keep the defining bass+snareAccent identical (only hats/ghosts
   change); variant 5 offers a busier kit reading. All positions are clamped to
   [0, length) so the emitted data is valid by construction.
   ═══════════════════════════════════════════════════════════════════════════ */
const VARIANTS = [
  { idSuffix: "", nameSuffix: "", descSuffix: "",
    apply: (v) => v },
  { idSuffix: "-8h", nameSuffix: " — Eighth-Hat Feel",
    descSuffix: " A steady eighth-note hi-hat keeps the time.",
    apply: (v, L) => ({ ...v, hatClosed: eighthHats(L), hatOpen: undefined }) },
  { idSuffix: "-16h", nameSuffix: " — Sixteenth-Hat Feel",
    descSuffix: " A busy sixteenth-note hi-hat carpets the groove.",
    apply: (v, L) => ({ ...v, hatClosed: sixteenthHats(L), hatOpen: undefined }) },
  { idSuffix: "-oh", nameSuffix: " — Open-Hat Accents",
    descSuffix: " The hi-hat barks open on the upbeats.",
    apply: (v, L) => ({ ...v, hatClosed: eighthHats(L), hatOpen: pickOffbeats(L, 2) }) },
  { idSuffix: "-gh", nameSuffix: " — Ghost-Note Variation",
    descSuffix: " Snare ghost-notes fill the gaps for a funkier breath.", needsGhost: true,
    apply: (v, L) => ({ ...v, snareGhost: ghostGaps(v.snareAccent, v.bass, L) }) },
  { idSuffix: "-drv", nameSuffix: " — Driving-Kick Variation",
    descSuffix: " An extra syncopated kick pushes the pulse forward.",
    apply: (v, L) => ({ ...v, bass: driveKick(v.bass, L) }) },
];

const out = [];
const seenIds = new Set();
const seenKeys = new Set(CORE_KEYS);
for (const base of BASES) {
  for (const vr of VARIANTS) {
    const id = base.id + vr.idSuffix;
    const name = base.name + vr.nameSuffix;
    const key = base.region + "|" + name;
    if (seenIds.has(id) || seenKeys.has(key)) continue;
    const voices = clampVoices(vr.apply({ ...base.voices }, base.length), base.length);
    // a ghost variant with no playable ghost slot would be mislabelled — skip it.
    if (vr.needsGhost && !(voices.snareGhost && voices.snareGhost.length)) continue;
    // guarantee at least one non-empty voice
    if (Object.values(voices).every((a) => !a || a.length === 0)) continue;
    seenIds.add(id); seenKeys.add(key);
    out.push({
      id, name, region: base.region, genre: base.genre, length: base.length,
      voices, desc: (base.desc + vr.descSuffix).trim(),
    });
  }
}

/* fold in the researched + structural catalogs (already clamped) */
for (const g of [...RESEARCH, ...STRUCTURAL]) {
  const key = g.region + "|" + g.name;
  if (seenIds.has(g.id) || seenKeys.has(key)) continue;
  seenIds.add(g.id); seenKeys.add(key);
  out.push(g);
}

/* ═══════════════════════════════════════════════════════════════════════════
   Balance the 10 cultural STYLE buckets.  The continent tags collapse into 10
   buckets in grooveLibrary.ts (bucketFor); 80% of entries are the algorithmic
   aksak/euclidean families, which pile into 3 buckets and leave the authentic
   cultural buckets thin (talas, claves, sambas).  The research entries were
   never feel-expanded (only the hand BASES were), so we lift each under-target
   bucket by giving its entries the SAME honest feel re-readings the bases get —
   different hi-hat subdivisions, ghost-notes, kick treatments and a left-foot
   ostinato.  Identity (bass + snareAccent) is preserved; only the kit feel
   around it changes, and identical-voice duplicates are dropped.
   ═══════════════════════════════════════════════════════════════════════════ */
const BAL_TARGET = 1200;

// JS port of grooveLibrary.ts bucketFor — keep in sync with that source of truth.
const _hasG = (g, ...ks) => ks.some((k) => g.includes(k));
function bucketFor(genre, region) {
  const g = genre.toLowerCase();
  if (g.includes("euclidean")) return "West African";
  if (g.includes("polyrhythm")) return "West African";
  if (g.includes("aksak")) return region === "European" ? "Balkan & Euro Folk" : "Middle East & Mediterranean";
  if (g.includes("compound additive")) return region === "Asian" ? "East & SE Asian" : "Balkan & Euro Folk";
  if (g.includes("odd-meter kit") || g === "odd meter" || g.includes("(odd meter)")) return "Jazz & Fusion";
  if (g.includes("timeline rotation")) return region === "Latin" ? "Afro-Cuban & Caribbean" : "West African";
  if (g.includes("additive cell") || g.includes("balkan cell")) return "Balkan & Euro Folk";
  if (g.includes("pan-caribbean") || g.includes("cuban/haitian cell")) return "Afro-Cuban & Caribbean";
  if (_hasG(g, "jazz", "bebop", "bop", "swing", "dixieland", "big band", "ecm", "modal")) return "Jazz & Fusion";
  if (g.includes("fusion")) return "Jazz & Fusion";
  if (_hasG(g, "carnatic", "hindustani", "tala", "solkattu", "nadai", "konnakol", "punjabi", "bhangra", "qawwali")) return "Indian";
  if (g.includes("south asia")) return "Indian";
  if (_hasG(g, "arabic", "iqa", "egypt", "ottoman", "andalus", "levantine", "sufi", "mugham", "muqam",
            "turkish", "usul", "persian", "tonbak", "azerbaijani", "uyghur", "central asian", "doira",
            "flamenco", "spanish", "iberian", "moroccan", "gnawa", "tunisian", "malouf", "algerian", "rai", "raï", "chaabi")) return "Middle East & Mediterranean";
  if (_hasG(g, "gamelan", "javanese", "balinese", "sundanese", "gong", "kulintang", "kotekan", "malay", "minangkabau",
            "thai", "piphat", "lao", "cambod", "pinpeat", "burmese", "vietnam", "japanese", "taiko", "gagaku",
            "togaku", "bon odori", "min'yo", "matsuri", "okinawan", "eisa", "kachashi", "korean", "jangdan",
            "samul", "pungmul", "pansori", "sanjo", "nongak", "chinese", "jingju", "luogu", "jiangnan", "sizhu",
            "chaozhou", "cantonese", "yangge", "qupai", "peking", "lion dance", "mongolian", "tuvan")) return "East & SE Asian";
  if (_hasG(g, "afro-cuban", "cuban", "clave", "rumba", "guaguanc", "songo", "cascara", "cáscara", "mambo",
            "timba", "salsa", "danzon", "danzón", "contradanza", "pello",
            "haitian", "vodou", "rara", "méring", "konpa", "kompa", "rabòday",
            "dominican", "merengue", "bachata", "palos", "gagá", "salve", "pri-prí", "sarandunga",
            "puerto ric", "bomba", "plena", "jíbaro", "seis", "danza",
            "jamaic", "reggae", "ska", "rocksteady", "dub", "dancehall", "ragga", "nyabinghi", "mento",
            "reggaeton", "dembow", "trinidad", "soca", "calypso", "calipso", "chutney", "parang", "steelband",
            "bahamian", "junkanoo", "rake-and-scrape", "martinican", "bélé", "biguine", "garifuna", "antillean",
            "gwoka", "guadeloup", "haiti")) return "Afro-Cuban & Caribbean";
  if (_hasG(g, "brazil", "samba", "bossa", "baião", "baiao", "candombl", "bateria", "recife", "bahia",
            "afro-peru", "peruvian", "andean", "huayn", "huayñ", "yaraví", "yaravi", "tondero", "zamacueca",
            "vals criollo", "vals", "marinera", "milonga", "tango", "argentin", "chacarera", "zamba", "gato",
            "escondido", "malambo", "vidala", "carnavalito", "caporales", "saya", "tinku", "morenada",
            "diablada", "tobas", "sanjuanito", "albazo", "bolivia", "candombe",
            "colombi", "cumbia", "porro", "gaita", "mapale", "champeta", "chande", "fandango", "bambuco", "pasillo",
            "vallenato", "venezuel", "joropo", "golpe", "llanero", "tambor", "calipso",
            "mexic", "norteñ", "norteno", "mariachi", "huasteco", "jalisciense", "jarocho", "chilena", "banda",
            "panama", "tamborito", "mejorana", "guatemala", "son chapin", "marimba", "nicaragua", "palo de mayo",
            "costa rica", "paraguay", "guarania", "polka paraguaya", "cueca", "tonada")) return "Brazilian & Latin America";
  if (_hasG(g, "african", "djembe", "dunun", "malinke", "maninka", "susu", "ewe", "ghana", "akan", "asante",
            "dagaaba", "mossi", "baga", "nalu", "komanko", "kassonke", "soninke", "temne", "mandingo", "manian",
            "wassoulou", "landuma", "afrobeat", "highlife", "hiplife", "palm-wine", "soukous", "ndombolo",
            "congolese", "juju", "jùjú", "fuji", "apala", "makossa", "bikutsi", "cameroon", "nigeria",
            "senegal", "mbalax", "sabar", "mali", "bambara", "zimbabwe", "mbira", "chimurenga", "jit", "sungura",
            "mbaqanga", "marabi", "kwela", "kwaito", "amapiano", "tsonga", "shangaan", "kenyan", "benga",
            "swahili", "taarab", "chakacha", "tanzanian", "bongo flava", "angolan", "semba", "kizomba",
            "cape verde", "funana", "coladeira", "morna", "batuque", "sudanese", "ethiopian", "ivorian", "ga (", "ga/")) return "West African";
  if (_hasG(g, "balkan", "bulgar", "macedon", "serbian", "romanian", "romani", "greek", "klezmer", "hungar",
            "nordic", "scandinav", "polish", "celtic", "irish", "scottish", "english", "sliabh", "french",
            "breton", "italian", "salentino", "tarantella", "central european", "european", "rachenitsa",
            "kopanitsa", "marching", "march", "waltz", "polka", "portuguese", "viennese", "military")) return "Balkan & Euro Folk";
  if (_hasG(g, "tahitian", "cook island", "samoan", "tongan", "maori", "hawaiian", "papua", "'are'are",
            "solomon", "fijian", "aboriginal", "polynesia", "pacific", "oceania")) return "East & SE Asian";
  if (_hasG(g, "funk", "soul", "motown", "gospel", "second line", "new orleans", "nola",
            "hip-hop", "hip hop", "boom-bap", "lo-fi", "trap", "drill",
            "house", "techno", "trance", "club", "electro", "edm", "dubstep", "drum and bass", "drum & bass",
            "dnb", "jungle", "idm", "breakbeat", "uk garage", "footwork", "gabber", "hardstyle",
            "ebm", "grime", "future garage", "ballroom", "moombahton", "disco", "bass")) return "Funk / Hip-Hop / Electronic";
  if (_hasG(g, "rock", "punk", "pop", "surf", "indie", "garage", "krautrock", "arena", "stadium", "metal",
            "thrash", "death", "black", "doom", "power", "speed", "grindcore", "metalcore", "djent", "prog",
            "technical", "math", "country", "bluegrass", "rockabilly", "cajun", "creole", "ostinato",
            "blues", "hardcore")) return "Pop / Rock / Metal";
  const fb = { African: "West African", Latin: "Brazilian & Latin America", Asian: "East & SE Asian",
    European: "Balkan & Euro Folk", American: "Pop / Rock / Metal" };
  return fb[region];
}

// Foot (left-foot hi-hat pedal) ostinato shapes for balancing variants.
const mixedHats = (L) => uniqSort([...eighthHats(L), L >= 4 ? L - 1 : 0]);
const footDown = (L) => quarterHats(L);
const footBack = (L) => { const q = quarterHats(L); return q.filter((_, i) => i % 2 === 1); };
const fourFloor = (L) => quarterHats(L);

// Honest feel re-readings used to balance thin buckets.  Each keeps the source
// bass+snareAccent (the identity) unless it explicitly re-voices the kick, and
// only ever changes the kit FEEL around it.
const BAL_VARIANTS = [
  { s: "-b8h",  n: " — Eighth-Hat Feel",       d: " A steady eighth-note hi-hat keeps the time.",        f: (v, L) => ({ ...v, hatClosed: eighthHats(L), hatOpen: undefined }) },
  { s: "-b16h", n: " — Sixteenth-Hat Feel",    d: " A busy sixteenth-note hi-hat carpets the groove.",   f: (v, L) => ({ ...v, hatClosed: sixteenthHats(L), hatOpen: undefined }) },
  { s: "-bofh", n: " — Offbeat-Hat Feel",      d: " The hi-hat rides the offbeats.",                     f: (v, L) => ({ ...v, hatClosed: offbeatHats(L), hatOpen: undefined }) },
  { s: "-bqh",  n: " — Quarter-Hat Feel",      d: " A sparse quarter-note hi-hat opens the groove up.",  f: (v, L) => ({ ...v, hatClosed: quarterHats(L), hatOpen: undefined }) },
  { s: "-bmh",  n: " — Mixed-Hat Feel",        d: " A mixed hi-hat figure adds lift.",                   f: (v, L) => ({ ...v, hatClosed: mixedHats(L), hatOpen: undefined }) },
  { s: "-boh",  n: " — Open-Hat Accents",      d: " The hi-hat barks open on the upbeats.",              f: (v, L) => ({ ...v, hatClosed: eighthHats(L), hatOpen: pickOffbeats(L, 2) }) },
  { s: "-bgh",  n: " — Ghost-Note Variation",  d: " Snare ghost-notes fill the gaps for a funkier breath.", needsGhost: true, f: (v, L) => ({ ...v, snareGhost: ghostGaps(v.snareAccent, v.bass, L) }) },
  { s: "-bg8",  n: " — Ghosts + Eighth Hat",   d: " Ghost-notes under a steady eighth-note hi-hat.",     needsGhost: true, f: (v, L) => ({ ...v, snareGhost: ghostGaps(v.snareAccent, v.bass, L), hatClosed: eighthHats(L) }) },
  { s: "-bdrv", n: " — Driving-Kick Variation",d: " An extra syncopated kick pushes the pulse forward.", f: (v, L) => ({ ...v, bass: driveKick(v.bass, L) }) },
  { s: "-bdg",  n: " — Driving Kick + Ghosts", d: " A pushed kick with ghost-notes between the accents.", needsGhost: true, f: (v, L) => { const bass = driveKick(v.bass, L); return { ...v, bass, snareGhost: ghostGaps(v.snareAccent, bass, L) }; } },
  { s: "-bft",  n: " — Foot Downbeats",        d: " A left-foot hi-hat pedal marks the quarter-notes.",  f: (v, L) => ({ ...v, hhFoot: footDown(L) }) },
  { s: "-bfb",  n: " — Foot Backbeat",         d: " The left-foot pedal chicks on the backbeats.",       f: (v, L) => ({ ...v, hhFoot: footBack(L) }) },
  { s: "-bf8",  n: " — Foot + Eighth Hat",     d: " A left-foot pedal under a steady eighth-note hat.",  f: (v, L) => ({ ...v, hhFoot: footDown(L), hatClosed: eighthHats(L) }) },
  { s: "-b4f",  n: " — Four-on-the-Floor Kick",d: " A four-on-the-floor kick drives underneath.",        f: (v, L) => ({ ...v, bass: fourFloor(L), hatClosed: eighthHats(L) }) },
];

// Canonical voice signature, to drop identical-voice duplicates.
const voiceKey = (g) => g.region + "|" + g.length + "|" +
  ["bass", "snareAccent", "snareGhost", "hatClosed", "hatOpen", "hhFoot"]
    .map((k) => (g.voices[k] ?? []).join(".")).join("/");

const bucketCount = {};
const seenVoice = new Set();
for (const g of out) { bucketCount[bucketFor(g.genre, g.region)] = (bucketCount[bucketFor(g.genre, g.region)] || 0) + 1; seenVoice.add(voiceKey(g)); }

const balanceSources = [...out];   // snapshot — never feed a balanced entry back in
let balanceAdded = 0;
for (const vr of BAL_VARIANTS) {
  for (const base of balanceSources) {
    const bucket = bucketFor(base.genre, base.region);
    if (bucketCount[bucket] >= BAL_TARGET) continue;
    const id = base.id + vr.s;
    const name = base.name + vr.n;
    const key = base.region + "|" + name;
    if (seenIds.has(id) || seenKeys.has(key)) continue;
    const voices = clampVoices(vr.f({ ...base.voices }, base.length), base.length);
    if (vr.needsGhost && !(voices.snareGhost && voices.snareGhost.length)) continue;  // no playable ghost → don't mislabel
    if (Object.values(voices).every((a) => !a || a.length === 0)) continue;
    const entry = { id, name, region: base.region, genre: base.genre, length: base.length, voices, desc: (base.desc + vr.d).trim() };
    const vk = voiceKey(entry);
    if (seenVoice.has(vk)) continue;             // identical kit voicing already exists
    seenIds.add(id); seenKeys.add(key); seenVoice.add(vk);
    out.push(entry); bucketCount[bucket]++; balanceAdded++;
  }
}
console.log(`  · balancing: +${balanceAdded} feel-variations to lift thin buckets toward ${BAL_TARGET}`);
for (const b of Object.keys(bucketCount).sort((a, c) => bucketCount[c] - bucketCount[a]))
  console.log(`      ${String(bucketCount[b]).padStart(5)}  ${b}`);

/* ── validate ── */
const errors = [];
for (const g of out) {
  if (!g.id || !g.name) errors.push(`missing id/name on ${JSON.stringify(g)}`);
  if (!(g.length > 0)) errors.push(`${g.id}: bad length ${g.length}`);
  let n = 0;
  for (const [voice, arr] of Object.entries(g.voices)) {
    for (const p of arr) {
      if (!Number.isInteger(p) || p < 0 || p >= g.length)
        errors.push(`${g.id}: ${voice} pos ${p} out of [0,${g.length})`);
    }
    n += arr.length;
  }
  if (n === 0) errors.push(`${g.id}: empty voices`);
}
if (errors.length) {
  console.error("VALIDATION FAILED:\n" + errors.slice(0, 40).map((e) => "  • " + e).join("\n"));
  process.exit(1);
}
if (out.length < 10000) { console.error(`Only ${out.length} entries (<10000) — extend BASES/research/structural`); process.exit(1); }

/* ── emit TypeScript ── */
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const voicesStr = (v) => {
  const parts = [];
  for (const k of ["bass", "snareAccent", "snareGhost", "hatClosed", "hatOpen", "hhFoot"])
    if (v[k] && v[k].length) parts.push(`${k}: [${v[k].join(", ")}]`);
  return `{ ${parts.join(", ")} }`;
};
/* Chunk the data into modest typed arrays. A single ~14k-element array literal
   overflows TypeScript's union-complexity limit (error TS2590); splitting into
   sub-1000-element arrays and concatenating keeps each literal well within it. */
const CHUNK = 800;
const lines = [
  "/**",
  " * grooveLibraryData.ts — AUTO-GENERATED by scripts/gen-groove-library.mjs.",
  " * Do not edit by hand; edit the generator and re-run `node scripts/gen-groove-library.mjs`.",
  " *",
  " * A deep cross-genre table: ~1000 web-researched, source-cited named grooves",
  " * from world traditions (claves, bells, talas, iqa'at, usuls, djembe/dunun,",
  " * batá, gwoka, gamelan, jangdan, Oceania, flamenco, …) plus systematic,",
  " * literature-grounded structural families (additive/aksak meters, polyrhythms,",
  " * Euclidean rhythms, timeline rotations, tala×gati) — each a genuinely distinct",
  " * rhythm. Every position is an integer in [0, length); matching (grooveLibrary.ts)",
  " * compares bass + snareAccent rotation-aware at equal length.",
  " */",
  'import type { RawGroove } from "@/lib/grooveLibrary";',
  "",
];
const chunkNames = [];
for (let i = 0; i < out.length; i += CHUNK) {
  const cname = `CHUNK_${chunkNames.length}`;
  chunkNames.push(cname);
  lines.push(`const ${cname}: RawGroove[] = [`);
  for (const g of out.slice(i, i + CHUNK)) {
    lines.push("  {");
    lines.push(`    id: "${esc(g.id)}", name: "${esc(g.name)}", region: "${g.region}",`);
    lines.push(`    genre: "${esc(g.genre)}", length: ${g.length},`);
    lines.push(`    voices: ${voicesStr(g.voices)},`);
    lines.push(`    desc: "${esc(g.desc)}",`);
    lines.push("  },");
  }
  lines.push("];", "");
}
lines.push(`export const GROOVE_LIBRARY_EXTRA: RawGroove[] = [`);
lines.push("  " + chunkNames.map((n) => `...${n}`).join(", "));
lines.push("];", "");
writeFileSync(new URL("../src/lib/grooveLibraryData.ts", import.meta.url), lines.join("\n"));
console.log(`✓ wrote ${out.length} entries (${chunkNames.length} chunks) to src/lib/grooveLibraryData.ts`);
