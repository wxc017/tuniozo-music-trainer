// ── Blues corpus: curated canonical solos, real audio + AI transcription ──
//
// Per direct user direction (2026-05): drop the fan-tab .gp approach.  Instead
// curate well-renowned solos by the great blues guitarists (lots of LIVE; for
// Hendrix his blues + live), pull the best recording off YouTube (bias to
// official / Topic / live; reject AI uploads), download the audio LOCALLY so
// the app plays offline, then run a lightweight AI transcription (transcribe.py)
// which both (a) finds the solo section and (b) emits an approximate melody for
// the Show-Answer notation ("doesn't have to be accurate — learn by ear").
//
// Audio → public/blues/audio/<vid>.mp3 (GITIGNORED; copyrighted, personal use).
// Corpus → public/transcriptions/blues.json.  Needs yt-dlp + ffmpeg + python.
//
//   node scripts/build-transcriptions/blues.mjs

import { writeFileSync, existsSync, mkdirSync, statSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync, execSync, execFile } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";
import { writeSource, rebuildIndex, isMain } from "./common.mjs";

// Portable Chromaprint binary (gitignored) — used to fingerprint each track so
// we can drop audio-identical entries that share an audio footprint across
// different "albums" (compilations, re-issues, fan-made bootlegs).
const FPCALC = process.env.FPCALC || join(dirname(fileURLToPath(import.meta.url)), "bin", "fpcalc.exe");

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = join(__dirname, "..", "..", "public", "blues", "audio");
mkdirSync(AUDIO_DIR, { recursive: true });
const YTDLP = process.env.YTDLP || "C:\\Users\\wilda\\AppData\\Local\\Programs\\Python\\Python315\\Scripts\\yt-dlp.exe";
const PYTHON = process.env.PYTHON || "python";
const TRANSCRIBE = join(__dirname, "transcribe.py");
const WINDOW = 24;   // seconds of solo to capture per tune

// Roster of essential blues artists, each tagged (Guitar) or (Vocals).  `q` is
// the search query (live-biased where the canonical version is live).  Sourced
// from each artist's essential studio + live albums; the proven per-track
// resolver downloads the full song (album-playlist auto-download isn't reliable
// through YouTube, so we curate the essential repertoire per artist instead).
const A = (artist, role, list) => list.map(([title, q]) => ({ artist, role, title, q: `${artist} ${q}` }));
const ROSTER = [
  // ───────────────────────── GUITAR ─────────────────────────
  ...A("Albert King", "Guitar", [
    ["Blues Power (live)", "Blues Power live wire"], ["Born Under a Bad Sign", "Born Under a Bad Sign"],
    ["Crosscut Saw", "Crosscut Saw"], ["I'll Play the Blues for You", "I'll Play the Blues for You live"],
    ["Stormy Monday (live)", "Stormy Monday live"], ["Blues at Sunrise (live)", "Blues at Sunrise live"],
    ["As the Years Go Passing By", "As the Years Go Passing By"], ["The Hunter", "The Hunter"],
    ["Oh Pretty Woman", "Oh Pretty Woman"], ["Laundromat Blues", "Laundromat Blues"],
    ["Personal Manager", "Personal Manager"], ["Cold Feet", "Cold Feet"],
    ["Don't Throw Your Love on Me So Strong", "Don't Throw Your Love on Me So Strong"], ["Angel of Mercy", "Angel of Mercy"],
    ["Travelin' to California", "Travelin to California"], ["Killing Floor", "Killing Floor"],
    ["Drowning on Dry Land", "Drowning on Dry Land"], ["Breaking Up Somebody's Home", "Breaking Up Somebody's Home"],
    ["Down Don't Bother Me", "Down Don't Bother Me"], ["Wrapped Up in Love Again", "Wrapped Up in Love Again"],
    ["Match Box Blues", "Match Box Blues"], ["Overall Junction", "Overall Junction"],
  ]),
  ...A("Stevie Ray Vaughan", "Guitar", [
    ["Texas Flood (live)", "Texas Flood live el mocambo"], ["Lenny", "Lenny live"], ["Little Wing", "Little Wing"],
    ["Tin Pan Alley (live)", "Tin Pan Alley live"], ["Cold Shot", "Cold Shot live"], ["Pride and Joy", "Pride and Joy live"],
    ["Voodoo Child (Slight Return)", "Voodoo Child Slight Return live"], ["Couldn't Stand the Weather", "Couldn't Stand the Weather"],
    ["Scuttle Buttin'", "Scuttle Buttin"], ["Riviera Paradise", "Riviera Paradise"], ["Crossfire", "Crossfire live"],
    ["The Sky Is Crying", "The Sky Is Crying"], ["Mary Had a Little Lamb", "Mary Had a Little Lamb"],
    ["Love Struck Baby", "Love Struck Baby"], ["Rude Mood", "Rude Mood"], ["Look at Little Sister", "Look at Little Sister"],
    ["Honey Bee", "Honey Bee live"], ["Leave My Girl Alone", "Leave My Little Girl Alone live"],
    ["Say What!", "Say What"], ["Empty Arms", "Empty Arms"], ["Wall of Denial", "Wall of Denial"],
    ["Going Down (live)", "Going Down live jam"],
  ]),
  ...A("B.B. King", "Guitar", [
    ["The Thrill Is Gone (live)", "The Thrill Is Gone live"], ["Sweet Little Angel (live)", "Sweet Little Angel live at the regal"],
    ["How Blue Can You Get (live)", "How Blue Can You Get live"], ["Every Day I Have the Blues (live)", "Every Day I Have the Blues live regal"],
    ["Why I Sing the Blues (live)", "Why I Sing the Blues live"], ["Rock Me Baby", "Rock Me Baby live"],
    ["Three O'Clock Blues", "Three O'Clock Blues"], ["Paying the Cost to Be the Boss", "Paying the Cost to Be the Boss"],
    ["Lucille", "Lucille"], ["Don't Answer the Door", "Don't Answer the Door live"], ["Worry, Worry (live)", "Worry Worry live regal"],
    ["Gambler's Blues", "Gambler's Blues"], ["Chains and Things", "Chains and Things"], ["Hummingbird", "Hummingbird"],
    ["Nobody Loves Me But My Mother", "Nobody Loves Me But My Mother"], ["Help the Poor", "Help the Poor"],
    ["You Upset Me Baby", "You Upset Me Baby"], ["Sweet Sixteen", "Sweet Sixteen"], ["Please Love Me", "Please Love Me"],
    ["It's My Own Fault", "It's My Own Fault live"], ["Woke Up This Morning", "Woke Up This Morning"], ["Ask Me No Questions", "Ask Me No Questions"],
  ]),
  ...A("Jimi Hendrix", "Guitar", [
    ["Red House (live)", "Red House live"], ["Hear My Train A Comin' (live)", "Hear My Train A Comin live"],
    ["Machine Gun (live)", "Machine Gun band of gypsys live"], ["Voodoo Child (Slight Return)", "Voodoo Child Slight Return live"],
    ["Catfish Blues (live)", "Catfish Blues live"], ["Killing Floor (Monterey)", "Killing Floor live Monterey"],
    ["Voodoo Chile", "Voodoo Chile blues long"], ["Bleeding Heart (live)", "Bleeding Heart live"],
    ["Hey Joe (live)", "Hey Joe live"], ["Wild Thing (Monterey)", "Wild Thing live Monterey"],
    ["Spanish Castle Magic (live)", "Spanish Castle Magic live"], ["Johnny B. Goode (live)", "Johnny B Goode live"],
    ["Lover Man (live)", "Lover Man live"], ["Stone Free (live)", "Stone Free live"], ["Foxy Lady (live)", "Foxy Lady live"],
    ["Purple Haze (live)", "Purple Haze live"], ["Izabella (live)", "Izabella live"], ["Power of Soul (live)", "Power of Soul band of gypsys"],
    ["Who Knows (live)", "Who Knows band of gypsys live"], ["Star Spangled Banner (Woodstock)", "Star Spangled Banner Woodstock"],
    ["Little Wing", "Little Wing"], ["Fire (live)", "Fire live"],
  ]),
  ...A("Eric Clapton", "Guitar", [
    ["Crossroads (Cream, live)", "Crossroads Cream live wheels of fire"], ["Have You Ever Loved a Woman (live)", "Have You Ever Loved a Woman live"],
    ["Further On Up the Road (live)", "Further On Up the Road live"], ["Old Love (live)", "Old Love live 24 nights"],
    ["Layla", "Layla"], ["White Room (Cream)", "Cream White Room"], ["Sunshine of Your Love (live)", "Cream Sunshine of Your Love live"],
    ["Spoonful (Cream, live)", "Cream Spoonful live"], ["Steppin' Out (Bluesbreakers)", "Bluesbreakers Steppin Out"],
    ["Hideaway (Bluesbreakers)", "Bluesbreakers Hideaway"], ["All Your Love (Bluesbreakers)", "Bluesbreakers All Your Love"],
    ["Ramblin' on My Mind", "Bluesbreakers Ramblin on My Mind"], ["Double Trouble (live)", "Double Trouble live"],
    ["Key to the Highway", "Key to the Highway derek dominos"], ["Bell Bottom Blues", "Bell Bottom Blues"],
    ["Cocaine (live)", "Cocaine live"], ["Badge", "Badge Cream"], ["Strange Brew (Cream)", "Cream Strange Brew"],
    ["Five Long Years (live)", "Five Long Years live"], ["Nobody Knows You When You're Down and Out", "Nobody Knows You When You're Down and Out unplugged"],
    ["I'm So Glad (Cream, live)", "Cream I'm So Glad live"], ["Got to Get Better in a Little While (live)", "Derek and the Dominos Got to Get Better live"],
  ]),
  // Cushion of further canonical solos so the corpus comfortably clears 100.
  ...A("Albert King", "Guitar", [
    ["I Get Evil", "I Get Evil"], ["You Sure Drive a Hard Bargain", "You Sure Drive a Hard Bargain"],
    ["That's What the Blues Is All About", "That's What the Blues Is All About"], ["Answer to the Laundromat Blues", "Answer to the Laundromat Blues"],
  ]),
  ...A("Stevie Ray Vaughan", "Guitar", [
    ["Life by the Drop", "Life by the Drop"], ["Texas Flood (studio)", "Texas Flood studio"],
    ["Lookin' Out the Window", "Lookin Out the Window"], ["Travis Walk", "Travis Walk"],
  ]),
  ...A("B.B. King", "Guitar", [
    ["The Thrill Is Gone (studio)", "The Thrill Is Gone studio completely well"], ["Caldonia (live)", "Caldonia live"],
    ["Let the Good Times Roll", "Let the Good Times Roll BB King"], ["Never Make a Move Too Soon", "Never Make a Move Too Soon"],
  ]),
  ...A("Jimi Hendrix", "Guitar", [
    ["All Along the Watchtower", "All Along the Watchtower"], ["Bold as Love", "Bold as Love"],
    ["Castles Made of Sand", "Castles Made of Sand"], ["Pali Gap", "Pali Gap"],
  ]),
  ...A("Eric Clapton", "Guitar", [
    ["Wonderful Tonight (live)", "Wonderful Tonight live"], ["I Shot the Sheriff (live)", "I Shot the Sheriff live"],
    ["Tell the Truth (live)", "Derek and the Dominos Tell the Truth live"], ["Why Does Love Got to Be So Sad (live)", "Derek and the Dominos Why Does Love live"],
  ]),
  ...A("Muddy Waters", "Guitar", [
    ["Hoochie Coochie Man", "Hoochie Coochie Man"], ["Mannish Boy", "Mannish Boy"], ["Got My Mojo Working", "Got My Mojo Working"],
    ["Rollin' Stone", "Rollin Stone"], ["I Just Want to Make Love to You", "I Just Want to Make Love to You"], ["Baby Please Don't Go", "Baby Please Don't Go"],
    ["Long Distance Call", "Long Distance Call"], ["I Can't Be Satisfied", "I Can't Be Satisfied"], ["Trouble No More", "Trouble No More"],
    ["Forty Days and Forty Nights", "Forty Days and Forty Nights"], ["You Shook Me", "You Shook Me"], ["Champagne and Reefer", "Champagne and Reefer"],
    ["She's Nineteen Years Old", "She's Nineteen Years Old"], ["Blow Wind Blow", "Blow Wind Blow"], ["Standing Around Crying", "Standing Around Crying"],
  ]),
  ...A("Buddy Guy", "Guitar", [
    ["Damn Right I've Got the Blues", "Damn Right I've Got the Blues"], ["Stone Crazy", "Stone Crazy"], ["First Time I Met the Blues", "First Time I Met the Blues"],
    ["Mary Had a Little Lamb", "Mary Had a Little Lamb"], ["Five Long Years", "Five Long Years"], ["Feels Like Rain", "Feels Like Rain"],
    ["A Man and the Blues", "A Man and the Blues"], ["Let Me Love You Baby", "Let Me Love You Baby"], ["My Time After Awhile", "My Time After Awhile"],
    ["Sweet Little Angel (live)", "Sweet Little Angel live"], ["Skin Deep", "Skin Deep"], ["Stormy Monday (live)", "Stormy Monday live"],
  ]),
  ...A("Freddie King", "Guitar", [
    ["Hide Away", "Hide Away"], ["The Stumble", "The Stumble"], ["San-Ho-Zay", "San-Ho-Zay"], ["Have You Ever Loved a Woman", "Have You Ever Loved a Woman"],
    ["Going Down", "Going Down"], ["I'm Tore Down", "I'm Tore Down"], ["Lonesome Whistle Blues", "Lonesome Whistle Blues"], ["Sen-Sa-Shun", "Sen-Sa-Shun"],
    ["Just Pickin'", "Just Pickin"], ["Palace of the King", "Palace of the King"], ["Big Legged Woman", "Big Legged Woman"], ["Hideaway (live)", "Freddie King Hideaway live"],
  ]),
  ...A("T-Bone Walker", "Guitar", [
    ["Call It Stormy Monday", "Call It Stormy Monday"], ["T-Bone Shuffle", "T-Bone Shuffle"], ["Mean Old World", "Mean Old World"],
    ["Cold Cold Feeling", "Cold Cold Feeling"], ["West Side Baby", "West Side Baby"], ["Bobby Sox Blues", "Bobby Sox Blues"],
    ["T-Bone Blues", "T-Bone Blues"], ["Strollin' with Bones", "Strollin with Bones"], ["Papa Ain't Salty", "Papa Ain't Salty"],
  ]),
  ...A("Otis Rush", "Guitar", [
    ["I Can't Quit You Baby", "I Can't Quit You Baby"], ["All Your Love (I Miss Loving)", "All Your Love I Miss Loving"], ["Double Trouble", "Double Trouble"],
    ["So Many Roads So Many Trains", "So Many Roads So Many Trains"], ["Homework", "Homework"], ["Checking on My Baby", "Checking on My Baby"],
    ["Right Place Wrong Time", "Right Place Wrong Time"], ["It Takes Time", "It Takes Time"],
  ]),
  ...A("Magic Sam", "Guitar", [
    ["All Your Love", "Magic Sam All Your Love"], ["Easy Baby", "Easy Baby"], ["Sweet Home Chicago", "Magic Sam Sweet Home Chicago"],
    ["I Need You So Bad", "I Need You So Bad"], ["Looking Good", "Magic Sam Looking Good"], ["That's All I Need", "That's All I Need"],
    ["I Feel So Good", "Magic Sam I Feel So Good"], ["Mama Talk to Your Daughter", "Mama Talk to Your Daughter"],
  ]),
  ...A("Elmore James", "Guitar", [
    ["Dust My Broom", "Dust My Broom"], ["The Sky Is Crying", "Elmore James The Sky Is Crying"], ["It Hurts Me Too", "Elmore James It Hurts Me Too"],
    ["Shake Your Moneymaker", "Shake Your Moneymaker"], ["Done Somebody Wrong", "Done Somebody Wrong"], ["Standing at the Crossroads", "Standing at the Crossroads Elmore James"],
    ["Bleeding Heart", "Elmore James Bleeding Heart"], ["Stranger Blues", "Stranger Blues"],
  ]),
  ...A("John Lee Hooker", "Guitar", [
    ["Boom Boom", "Boom Boom"], ["Boogie Chillen", "Boogie Chillen"], ["I'm in the Mood", "I'm in the Mood"],
    ["One Bourbon One Scotch One Beer", "One Bourbon One Scotch One Beer"], ["Crawling King Snake", "Crawling King Snake"], ["Dimples", "Dimples"],
    ["Tupelo", "Tupelo John Lee Hooker"], ["Hobo Blues", "Hobo Blues"], ["It Serves Me Right to Suffer", "It Serves Me Right to Suffer"],
  ]),
  ...A("Lightnin' Hopkins", "Guitar", [
    ["Mojo Hand", "Mojo Hand"], ["Baby Please Don't Go", "Lightnin Hopkins Baby Please Don't Go"], ["Bring Me My Shotgun", "Bring Me My Shotgun"],
    ["Coffee Blues", "Lightnin Hopkins Coffee Blues"], ["Katie Mae", "Katie Mae"], ["Mr. Charlie", "Lightnin Hopkins Mr Charlie"],
    ["Trouble in Mind", "Lightnin Hopkins Trouble in Mind"], ["Short Haired Woman", "Short Haired Woman"],
  ]),
  ...A("Gary Moore", "Guitar", [
    ["Still Got the Blues", "Still Got the Blues"], ["Parisienne Walkways", "Parisienne Walkways"], ["The Loner", "Gary Moore The Loner"],
    ["Walking by Myself", "Gary Moore Walking by Myself"], ["Cold Day in Hell", "Cold Day in Hell"], ["Story of the Blues", "Story of the Blues"],
    ["Empty Rooms", "Gary Moore Empty Rooms"], ["Texas Strut", "Texas Strut"], ["Oh Pretty Woman (live)", "Gary Moore Oh Pretty Woman live"],
  ]),
  ...A("Peter Green", "Guitar", [
    ["Albatross", "Fleetwood Mac Albatross"], ["Black Magic Woman", "Fleetwood Mac Black Magic Woman"], ["Need Your Love So Bad", "Fleetwood Mac Need Your Love So Bad"],
    ["Oh Well", "Fleetwood Mac Oh Well"], ["The Green Manalishi", "Green Manalishi"], ["Man of the World", "Fleetwood Mac Man of the World"],
    ["I Loved Another Woman", "I Loved Another Woman Fleetwood Mac"], ["Love That Burns", "Love That Burns Fleetwood Mac"],
  ]),
  ...A("Robben Ford", "Guitar", [
    ["Help the Poor", "Robben Ford Help the Poor"], ["Talk to Your Daughter", "Robben Ford Talk to Your Daughter"], ["Revelation", "Robben Ford Revelation"],
    ["Chevrolet", "Robben Ford Chevrolet"], ["Indianola", "Robben Ford Indianola"], ["Rugantino", "Robben Ford Rugantino"], ["Mystic Mile", "Robben Ford Mystic Mile"],
  ]),
  ...A("Joe Bonamassa", "Guitar", [
    ["Sloe Gin", "Bonamassa Sloe Gin"], ["Blues Deluxe", "Bonamassa Blues Deluxe"], ["The Ballad of John Henry", "Ballad of John Henry Bonamassa"],
    ["Django", "Bonamassa Django"], ["Just Got Paid", "Bonamassa Just Got Paid"], ["Mountain Time", "Bonamassa Mountain Time"],
    ["Dust Bowl", "Bonamassa Dust Bowl"], ["Woke Up Dreaming", "Bonamassa Woke Up Dreaming"],
  ]),
  ...A("Bonnie Raitt", "Guitar", [
    ["Love Me Like a Man", "Bonnie Raitt Love Me Like a Man"], ["Angel from Montgomery", "Bonnie Raitt Angel from Montgomery"], ["Thing Called Love", "Bonnie Raitt Thing Called Love"],
    ["I Can't Make You Love Me", "Bonnie Raitt I Can't Make You Love Me"], ["Something to Talk About", "Bonnie Raitt Something to Talk About"], ["Runaway", "Bonnie Raitt Runaway"],
    ["Women Be Wise", "Bonnie Raitt Women Be Wise"],
  ]),
  // ───────────────────────── VOCALS ─────────────────────────
  ...A("Bessie Smith", "Vocals", [
    ["Down Hearted Blues", "Bessie Smith Down Hearted Blues"], ["St. Louis Blues", "Bessie Smith St Louis Blues"], ["Nobody Knows You When You're Down and Out", "Bessie Smith Nobody Knows You"],
    ["Empty Bed Blues", "Bessie Smith Empty Bed Blues"], ["Gimme a Pigfoot", "Bessie Smith Gimme a Pigfoot"], ["Backwater Blues", "Bessie Smith Backwater Blues"],
    ["Careless Love Blues", "Bessie Smith Careless Love Blues"], ["A Good Man Is Hard to Find", "Bessie Smith A Good Man Is Hard to Find"], ["Tain't Nobody's Bizness", "Bessie Smith Tain't Nobody's Bizness"],
  ]),
  ...A("Ma Rainey", "Vocals", [
    ["See See Rider", "Ma Rainey See See Rider"], ["Black Bottom", "Ma Rainey Black Bottom"], ["Bo-Weavil Blues", "Ma Rainey Bo Weavil Blues"],
    ["Prove It on Me Blues", "Ma Rainey Prove It on Me Blues"], ["Moonshine Blues", "Ma Rainey Moonshine Blues"], ["Trust No Man", "Ma Rainey Trust No Man"],
    ["Deep Moaning Blues", "Ma Rainey Deep Moaning Blues"],
  ]),
  ...A("Etta James", "Vocals", [
    ["At Last", "Etta James At Last"], ["I'd Rather Go Blind", "Etta James I'd Rather Go Blind"], ["Tell Mama", "Etta James Tell Mama"],
    ["Something's Got a Hold on Me", "Etta James Something's Got a Hold on Me"], ["A Sunday Kind of Love", "Etta James A Sunday Kind of Love"], ["Damn Your Eyes", "Etta James Damn Your Eyes"],
    ["Trust in Me", "Etta James Trust in Me"], ["All I Could Do Was Cry", "Etta James All I Could Do Was Cry"], ["W-O-M-A-N", "Etta James W-O-M-A-N"],
  ]),
  ...A("Big Mama Thornton", "Vocals", [
    ["Hound Dog", "Big Mama Thornton Hound Dog"], ["Ball and Chain", "Big Mama Thornton Ball and Chain"], ["Sweet Little Angel", "Big Mama Thornton Sweet Little Angel"],
    ["They Call Me Big Mama", "Big Mama Thornton They Call Me Big Mama"], ["Wade in the Water", "Big Mama Thornton Wade in the Water"], ["Little Red Rooster", "Big Mama Thornton Little Red Rooster"],
    ["Ball and Chain (live)", "Big Mama Thornton Ball and Chain live"],
  ]),
  ...A("Koko Taylor", "Vocals", [
    ["Wang Dang Doodle", "Koko Taylor Wang Dang Doodle"], ["I'm a Woman", "Koko Taylor I'm a Woman"], ["Voodoo Woman", "Koko Taylor Voodoo Woman"],
    ["Let the Good Times Roll", "Koko Taylor Let the Good Times Roll"], ["I Got What It Takes", "Koko Taylor I Got What It Takes"], ["Insane Asylum", "Koko Taylor Insane Asylum"],
  ]),
  ...A("Bobby \"Blue\" Bland", "Vocals", [
    ["Stormy Monday Blues", "Bobby Bland Stormy Monday Blues"], ["Turn On Your Love Light", "Bobby Bland Turn On Your Love Light"], ["I Pity the Fool", "Bobby Bland I Pity the Fool"],
    ["Cry Cry Cry", "Bobby Bland Cry Cry Cry"], ["Two Steps from the Blues", "Bobby Bland Two Steps from the Blues"], ["That's the Way Love Is", "Bobby Bland That's the Way Love Is"],
    ["Ain't Nothing You Can Do", "Bobby Bland Ain't Nothing You Can Do"], ["Lead Me On", "Bobby Bland Lead Me On"], ["St. James Infirmary", "Bobby Bland St James Infirmary"],
  ]),
  ...A("Big Joe Turner", "Vocals", [
    ["Shake Rattle and Roll", "Big Joe Turner Shake Rattle and Roll"], ["Flip Flop and Fly", "Big Joe Turner Flip Flop and Fly"], ["Chains of Love", "Big Joe Turner Chains of Love"],
    ["Honey Hush", "Big Joe Turner Honey Hush"], ["Corrine Corrina", "Big Joe Turner Corrine Corrina"], ["Roll 'Em Pete", "Big Joe Turner Roll Em Pete"],
    ["Sweet Sixteen", "Big Joe Turner Sweet Sixteen"],
  ]),
  ...A("Howlin' Wolf", "Vocals", [
    ["Smokestack Lightnin'", "Smokestack Lightnin"], ["Spoonful", "Howlin Wolf Spoonful"], ["Killing Floor", "Howlin Wolf Killing Floor"],
    ["Back Door Man", "Howlin Wolf Back Door Man"], ["Little Red Rooster", "Howlin Wolf Little Red Rooster"], ["How Many More Years", "How Many More Years"],
    ["Evil", "Howlin Wolf Evil"], ["I Ain't Superstitious", "I Ain't Superstitious"], ["Sitting on Top of the World", "Howlin Wolf Sitting on Top of the World"],
    ["Moanin' at Midnight", "Moanin at Midnight"],
  ]),
  ...A("Robert Johnson", "Vocals", [
    ["Cross Road Blues", "Robert Johnson Cross Road Blues"], ["Sweet Home Chicago", "Robert Johnson Sweet Home Chicago"], ["Hellhound on My Trail", "Robert Johnson Hellhound on My Trail"],
    ["Love in Vain", "Robert Johnson Love in Vain"], ["Come On in My Kitchen", "Robert Johnson Come On in My Kitchen"], ["Kind Hearted Woman Blues", "Robert Johnson Kind Hearted Woman"],
    ["Me and the Devil Blues", "Robert Johnson Me and the Devil Blues"], ["Terraplane Blues", "Robert Johnson Terraplane Blues"], ["Walkin' Blues", "Robert Johnson Walkin Blues"],
    ["32-20 Blues", "Robert Johnson 32-20 Blues"],
  ]),
];

// ── YouTube best-match via the allorigins proxy (bypasses the IP throttle) ──
function fetchSearchHtml(query) {
  const yt = "https://www.youtube.com/results?search_query=" + encodeURIComponent(query);
  const url = "https://api.allorigins.win/raw?url=" + encodeURIComponent(yt);
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } }, (res) => {
      let d = ""; res.on("data", (c) => { d += c; if (d.length > 4e6) res.destroy(); });
      res.on("end", () => resolve(d));
    });
    req.on("error", () => resolve(""));
    req.setTimeout(25000, () => { req.destroy(); resolve(""); });
  });
}
function parseDur(span) {
  // lengthText in the search JSON, e.g. "lengthText":{...,"simpleText":"4:32"}.
  const m = /"lengthText":\{[^}]*?"simpleText":"([\d:]+)"/.exec(span);
  if (!m) return null;
  const p = m[1].split(":").map(Number);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + (p[1] || 0);
}
function parseResults(html) {
  const out = [], seen = new Set();
  const re = /"videoId":"([\w-]{11})"([\s\S]{0,2500}?)"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*?)"/g;
  let m;
  while ((m = re.exec(html)) && out.length < 12) {
    if (seen.has(m[1])) continue; seen.add(m[1]);
    out.push({
      videoId: m[1],
      title: m[3].replace(/\\u0026/g, "&").replace(/\\"/g, '"').replace(/\\\//g, "/"),
      durSec: parseDur(m[2]),
    });
  }
  return out;
}
const AI = /\b(ai|a\.i\.|suno|udio|generated|ai[- ]?cover|deepfake|riffusion)\b/i;
const BAD = /cover|lesson|tutorial|backing track|karaoke|how to play|reaction|remix|guitar pro|\btab\b|8d audio/i;
function score(r, artist, title, wantLive) {
  const t = r.title.toLowerCase();
  const surname = artist.toLowerCase().split(" ").pop();
  const words = title.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter(w => w.length > 2);
  let s = 0;
  if (t.includes(artist.toLowerCase())) s += 3; else if (t.includes(surname)) s += 2;
  const hit = words.filter(w => t.includes(w)).length;
  s += words.length ? (hit / words.length) * 4 : 0;
  if (AI.test(t)) s -= 50;
  if (BAD.test(t)) s -= 6;
  if (/ - topic$|vevo|official audio|official video|remaster/i.test(t)) s += 3;   // official/auto-generated
  if (wantLive && /\blive\b/.test(t)) s += 2;
  // Prefer a single-song upload over album/compilation/full-concert dumps: those
  // wreck the solo-finder (it just grabs the densest 24s of a 40-min file).
  const d = r.durSec;
  if (d == null) s -= 4;                              // unknown length (livestream, etc.)
  else if (d > (wantLive ? 1200 : 900)) s -= 20;     // >20min live / >15min studio = album/comp
  else if (d > (wantLive ? 900 : 600)) s -= 8;       // long-ish — penalize but allow
  else if (d < 90) s -= 6;                            // snippet/clip
  else if (d >= 150 && d <= 480) s += 3;              // 2.5–8 min = the sweet spot
  return s;
}
async function bestVideo(s) {
  const wantLive = /live/i.test(s.q);
  // The allorigins proxy is flaky under bulk load (returns empty HTML), which
  // dropped many famous tracks as "no video" in one pass.  Retry several times
  // with backoff and only give up when scraping genuinely yields nothing.
  for (let attempt = 0; attempt < 5; attempt++) {
    const results = parseResults(await fetchSearchHtml(s.q));
    if (results.length) {
      let best = results[0], bestS = -Infinity;
      for (const r of results) { const sc = score(r, s.artist, s.title, wantLive); if (sc > bestS) { bestS = sc; best = r; } }
      return bestS >= 2 ? best.videoId : null;
    }
    await new Promise(r => setTimeout(r, 1200 + attempt * 800));
  }
  return null;
}

export async function build() {
  const items = [];
  // Resume: reuse already-built solos whose audio file is still present, so a
  // re-run only has to recover the ones that failed (flaky proxy) — no
  // re-downloading or re-transcribing the whole corpus.
  const prevPath = join(__dirname, "..", "..", "public", "transcriptions", "blues.json");
  const prev = new Map();
  try {
    for (const it of JSON.parse(readFileSync(prevPath, "utf8"))) prev.set(`${it.artist}|||${it.title}`, it);
  } catch { /* first run */ }

  // FORCE_TRANSCRIBE=1 re-runs the analyzer on already-downloaded files (reuses
  // the resolved video + mp3, recomputes the clip location) — used when the
  // clip-selection logic changes, without re-scraping/re-downloading.
  const force = !!process.env.FORCE_TRANSCRIBE;

  const styleOf = (s) => `${s.artist} (${s.role})`;
  for (const s of ROSTER) {
    const cached = prev.get(`${s.artist}|||${s.title}`);
    const cachedMp3 = cached?.audio ? join(AUDIO_DIR, cached.audio.replace(/^audio\//, "")) : null;
    let vid;
    if (cachedMp3 && existsSync(cachedMp3)) {
      if (!force) { items.push({ ...cached, id: `blues-${items.length}`, style: styleOf(s) }); continue; }
      vid = cached.vid;                          // reuse download; re-transcribe below
    } else {
      vid = await bestVideo(s);
      if (!vid) { console.log(`  no video: ${s.artist} - ${s.title}`); continue; }
      const dl = join(AUDIO_DIR, `${vid}.mp3`);
      if (!existsSync(dl) || statSync(dl).size < 10000) {
        try {
          execFileSync(YTDLP, ["-x", "--audio-format", "mp3", "--audio-quality", "5", "--no-playlist",
            "-o", join(AUDIO_DIR, `${vid}.%(ext)s`), `https://www.youtube.com/watch?v=${vid}`], { stdio: "ignore" });
        } catch { console.log(`  download failed: ${s.artist} - ${s.title}`); continue; }
      }
    }
    const mp3 = join(AUDIO_DIR, `${vid}.mp3`);
    if (!existsSync(mp3)) continue;
    // Blues is AUDIO-ONLY: the answer is the real recording, transcribed by ear.
    // The analyzer only LOCATES a guitar-active section for the clip start (not
    // restricted to the climactic solo).  No melody is emitted — a monophonic
    // tracker on a full band mix is noise, and showing wrong notes is worse.
    let tr;
    try { tr = JSON.parse(execSync(`"${PYTHON}" "${TRANSCRIBE}" "${mp3}" ${WINDOW}`, { encoding: "utf8", maxBuffer: 1 << 26 })); }
    catch { console.log(`  solo-find failed: ${s.artist} - ${s.title}`); continue; }
    if (tr.error) { console.log(`  ${tr.error}: ${s.artist} - ${s.title}`); continue; }

    const solostart = tr.soloStart || 0;
    const soloLen = Math.round(((tr.soloEnd ?? solostart + WINDOW) - solostart) * 100) / 100 || WINDOW;
    items.push({
      id: `blues-${items.length}`, source: "blues", genre: "Blues", style: styleOf(s),
      title: s.title, artist: s.artist,
      key: { tonicPc: 0, mode: "major" },
      timeSig: [4, 4], tempoBpm: tr.bpm || 100, barCount: 1,
      audio: `audio/${vid}.mp3`, solostart, soloLen, vid,
      youtubeQuery: s.q,
    });
    console.log(`  ${s.artist} (${s.role}) - ${s.title} -> ${vid} | clip @${solostart}s for ${soloLen}s`);
  }
  console.log(`Blues: built ${items.length}/${ROSTER.length} tracks`);
  writeSource("blues", items);
}

// ── Soulseek library → corpus ───────────────────────────────────────
// The albums are downloaded by sldl into public/blues/lib/.  sldl doesn't always
// populate the artist FOLDER (some tracks land in junk dirs), but the mp3 TAGS
// are reliable — so we resolve artist/title from the file's tags (ffprobe), map
// the tag artist to a roster artist (+ role), and locate the clip by a simple
// heuristic (start ~30% in) since per-track transcription of thousands of files
// is impractical.
const LIB_DIR = join(__dirname, "..", "..", "public", "blues", "lib");
const AUDIO_EXT = /\.(flac|mp3|m4a|ogg|opus|wav|aac)$/i;
const encPath = (p) => p.split(/[\\/]/).map(encodeURIComponent).join("/");

// Roster: [display, role, ...alias-substrings].  A tag artist matches if any
// alias (normalized) is contained in the normalized tag artist — so bands and
// "feat." credits fold into the right artist (Cream→Clapton, Double Trouble→SRV).
const CANON = [
  ["Albert King", "Guitar"], ["Stevie Ray Vaughan", "Guitar", "stevie ray vaughan", "double trouble"],
  ["B.B. King", "Guitar", "bb king"], ["Jimi Hendrix", "Guitar", "jimi hendrix", "band of gypsys"],
  ["Eric Clapton", "Guitar", "eric clapton", "cream", "derek and the dominos", "john mayall", "bluesbreakers"],
  ["Muddy Waters", "Guitar"], ["Buddy Guy", "Guitar"], ["Freddie King", "Guitar"],
  ["T-Bone Walker", "Guitar", "tbone walker"], ["Otis Rush", "Guitar"], ["Magic Sam", "Guitar"],
  ["Elmore James", "Guitar"], ["John Lee Hooker", "Guitar"], ["Lightnin' Hopkins", "Guitar", "lightnin hopkins"],
  ["Gary Moore", "Guitar"], ["Peter Green", "Guitar", "peter green", "fleetwood mac"],
  ["Robben Ford", "Guitar"], ["Joe Bonamassa", "Guitar"], ["Bonnie Raitt", "Guitar"],
  ["Bessie Smith", "Vocals"], ["Ma Rainey", "Vocals"], ["Etta James", "Vocals"],
  ["Big Mama Thornton", "Vocals"], ["Koko Taylor", "Vocals"],
  ["Bobby Blue Bland", "Vocals", "bobby bland", "bobby blue bland"], ["Big Joe Turner", "Vocals", "joe turner"],
  ["Howlin' Wolf", "Vocals", "howlin wolf"], ["Robert Johnson", "Vocals"],
].map(([display, role, ...aliases]) => ({ display, role, aliases: (aliases.length ? aliases : [display]).map(a => a.toLowerCase().replace(/[^a-z0-9]/g, "")) }));

function resolveArtist(tagArtist, path) {
  const hay = (`${tagArtist || ""} ${path}`).toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const c of CANON) if (c.aliases.some(a => hay.includes(a))) return c;
  return null;
}

const ONSETS = join(__dirname, "onsets.py");

function ffTags(file) {
  return new Promise((resolve) => {
    execFile("ffprobe", ["-v", "quiet", "-show_entries", "format=duration:format_tags=artist,album_artist,title", "-of", "json", file],
      { encoding: "utf8", maxBuffer: 1 << 24 }, (err, out) => {
        if (err) return resolve({ dur: 0, artist: "", title: "" });
        try { const fmt = JSON.parse(out).format || {}; const t = fmt.tags || {}; resolve({ dur: parseFloat(fmt.duration) || 0, artist: t.album_artist || t.artist || "", title: t.title || "" }); }
        catch { resolve({ dur: 0, artist: "", title: "" }); }
      });
  });
}

/** Run async fns over items with a concurrency cap (the onset analysis is the
 *  slow part — parallelising it keeps the whole-library pass to minutes). */
async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; results[k] = await fn(items[k], k); }
  }));
  return results;
}

function analyzeOnsets(file) {
  return new Promise((resolve) => {
    execFile(PYTHON, [ONSETS, file], { encoding: "utf8", maxBuffer: 1 << 26 }, (err, stdout) => {
      if (err) return resolve(null);
      try { resolve(JSON.parse(stdout)); } catch { resolve(null); }
    });
  });
}

// ── Chromaprint fingerprint (MusicBrainz-style audio identity) ──────
//
// `fpcalc -raw` emits the uncompressed 32-bit fingerprint as a CSV of uints
// (~8 hashes/sec, 120 s = ~960 hashes).  Two recordings are the SAME track if
// their durations match within a few seconds and their fingerprints have a low
// bit error rate (Hamming distance / total bits) — that's the AcoustID match
// criterion.  We use this to drop entries whose audio is byte-equivalent (e.g.
// the same B.B. King "The Thrill Is Gone" appearing on both _Completely Well_
// and a "Greatest Hits" compilation under different paths/titles).
function fpcalcRaw(file) {
  return new Promise((resolve) => {
    execFile(FPCALC, ["-raw", "-length", "120", file], { encoding: "utf8", maxBuffer: 1 << 24 }, (err, stdout) => {
      if (err) return resolve(null);
      let dur = 0, fp = null;
      for (const line of stdout.split(/\r?\n/)) {
        if (line.startsWith("DURATION=")) dur = parseFloat(line.slice(9)) || 0;
        else if (line.startsWith("FINGERPRINT=")) {
          const parts = line.slice(12).split(",");
          fp = new Uint32Array(parts.length);
          for (let i = 0; i < parts.length; i++) fp[i] = (parts[i] >>> 0);
        }
      }
      resolve(fp && fp.length ? { dur, fp } : null);
    });
  });
}

// Per-file fpcalc cache keyed by (path, size, mtime) so re-runs only fingerprint
// files that actually changed — fpcalc is ~1-2 s/file and the library is large.
const FP_CACHE_PATH = join(__dirname, ".cache", "blues-fpcache.json");
function loadFpCache() {
  try { return JSON.parse(readFileSync(FP_CACHE_PATH, "utf8")); } catch { return {}; }
}
function saveFpCache(cache) {
  mkdirSync(dirname(FP_CACHE_PATH), { recursive: true });
  writeFileSync(FP_CACHE_PATH, JSON.stringify(cache));
}
function fpCacheKey(abs) {
  const st = statSync(abs);
  return `${abs}|${st.size}|${Math.floor(st.mtimeMs)}`;
}

// Hamming distance between two equal-length 32-bit hash arrays — i.e. the
// number of bits that differ across the aligned fingerprint sequences.
function popcnt32(v) {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}
function fingerprintBitErrorRate(a, b) {
  const n = Math.min(a.length, b.length);
  if (!n) return 1;
  let diff = 0;
  for (let i = 0; i < n; i++) diff += popcnt32((a[i] ^ b[i]) >>> 0);
  return diff / (n * 32);
}
// AcoustID convention: BER < ~7% is a confident "same recording" match; we use
// 10% to be a touch more lenient (lossy re-encodes drift the fingerprint a few
// percent), still well below the cross-recording floor (~40-50%).
const FP_SAME_BER = 0.10;
const FP_SAME_DUR_S = 7;          // seconds tolerance on duration

// ── MusicBrainz lookup (canonical recording info for same-title pairs) ──
//
// When two files of the same artist+title turn out to be genuinely different
// recordings (BER too high to dedup), we still need to tell them apart in the
// picker.  Query the MusicBrainz Web Service (artist:"..." AND recording:"...")
// to enumerate the canonical recordings and match each of our files to one by
// duration (±5 s).  The matched recording's `disambiguation` ("live, 1972-...")
// or release title is then folded into the displayed title.
//
// MB rate-limits the public API to 1 req/sec for an identified User-Agent.
const MB_UA = "EarTrainerV2-BluesETL/1.0 ( https://github.com/wxc017/ear-trainer )";
const MB_CACHE_PATH = join(__dirname, ".cache", "blues-mbcache.json");
function loadMbCache() {
  try { return JSON.parse(readFileSync(MB_CACHE_PATH, "utf8")); } catch { return {}; }
}
function saveMbCache(cache) {
  mkdirSync(dirname(MB_CACHE_PATH), { recursive: true });
  writeFileSync(MB_CACHE_PATH, JSON.stringify(cache));
}
let mbLastReqAt = 0;
async function mbThrottle() {
  const wait = Math.max(0, 1100 - (Date.now() - mbLastReqAt));
  if (wait) await new Promise(r => setTimeout(r, wait));
  mbLastReqAt = Date.now();
}
function mbGet(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { "User-Agent": MB_UA, "Accept": "application/json" } }, (res) => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    }).on("error", () => resolve(null)).setTimeout(15000, function () { this.destroy(); resolve(null); });
  });
}
async function mbRecordings(artist, title, cache) {
  const key = `${artist}|||${title}`;
  if (cache[key]) return cache[key];
  await mbThrottle();
  const q = encodeURIComponent(`artist:"${artist}" AND recording:"${title.replace(/"/g, "")}"`);
  const url = `https://musicbrainz.org/ws/2/recording?query=${q}&fmt=json&limit=25`;
  const res = await mbGet(url);
  const recs = (res?.recordings || []).map(r => ({
    title: r.title, length: r.length, disambig: r.disambiguation,
    release: (r.releases || [])[0]?.title,
    date: r["first-release-date"] || (r.releases || [])[0]?.date,
  }));
  cache[key] = recs;
  return recs;
}
function pickMbVersion(recs, durMs) {
  const cands = recs.filter(r => r.length && Math.abs(r.length - durMs) <= 5000);
  if (!cands.length) return null;
  cands.sort((a, b) => Math.abs(a.length - durMs) - Math.abs(b.length - durMs));
  return cands[0];
}
/** Build a short, picker-friendly version label from an MB recording match. */
function mbVersionLabel(rec) {
  if (rec.disambig) {
    // Trim MB's verbose disambig down to "live 1972" / "studio 1969" / "alternate take".
    const kind = rec.disambig.match(/\b(live|studio|alternate(?: take)?|demo|edit|instrumental|remix|mono|stereo)\b/i);
    const year = rec.disambig.match(/\b(19|20)\d{2}\b/);
    if (kind && year) return `${kind[0].toLowerCase()} ${year[0]}`;
    if (kind) return kind[0].toLowerCase();
    if (year) return year[0];
    return rec.disambig.length > 36 ? rec.disambig.slice(0, 36).trim() + "…" : rec.disambig;
  }
  if (rec.release) {
    const clean = rec.release.replace(/\s*\([^)]*\)\s*$/, "").trim();
    return clean.length > 36 ? clean.slice(0, 36).trim() + "…" : clean;
  }
  if (rec.date) return rec.date.slice(0, 4);
  return null;
}

function walkAudio(dir, base = dir) {
  const out = [];
  let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkAudio(p, base));
    else if (e.isFile() && AUDIO_EXT.test(e.name) && !/\.incomplete$/i.test(e.name)) out.push(p);
  }
  return out;
}

export async function buildFromLibrary() {
  if (!existsSync(LIB_DIR)) { console.error(`no library at ${LIB_DIR}`); return; }
  const files = walkAudio(LIB_DIR);
  console.log(`Blues: analysing ${files.length} audio files…`);
  const fpCache = loadFpCache();
  let done = 0;
  // Parallel pass per file: ffprobe tags + onset detection + Chromaprint
  // fingerprint.  Onsets let the app pick a RANDOM window at play time that
  // actually contains notes (>=2 attacks); the fingerprint+duration drive the
  // post-pass dedup of audio-identical entries that share a footprint across
  // different albums.
  const raw = await pool(files, 8, async (abs) => {
    const tags = await ffTags(abs);
    if (++done % 200 === 0) console.log(`  …${done}/${files.length}`);
    if (tags.dur < 45) return null;                        // intros/skits/interludes
    const rel = "lib/" + abs.slice(LIB_DIR.length + 1).replace(/\\/g, "/");
    const c = resolveArtist(tags.artist, rel);
    if (!c) return null;                                   // can't attribute → skip
    const an = await analyzeOnsets(abs);
    if (!an || (an.onsets?.length ?? 0) < 4) return null;  // too sparse / silent
    const title = (tags.title || rel.split("/").pop().replace(AUDIO_EXT, "")).trim();
    // Fingerprint (cached by path+size+mtime).
    const key = fpCacheKey(abs);
    let fp = null, fpDur = tags.dur;
    const hit = fpCache[abs];
    if (hit && hit.key === key && Array.isArray(hit.fp)) {
      fp = new Uint32Array(hit.fp); fpDur = hit.dur ?? tags.dur;
    } else {
      const res = await fpcalcRaw(abs);
      if (res) {
        fp = res.fp; fpDur = res.dur || tags.dur;
        fpCache[abs] = { key, dur: fpDur, fp: Array.from(res.fp) };
      }
    }
    return { c, title, rel, onsets: an.onsets, bpm: an.bpm || 100, fp, fpDur };
  });
  saveFpCache(fpCache);

  await dedupAndWrite(raw.filter(Boolean));
}

// ── Dedup + MB rename + write the two source JSONs ──────────────────
//
// Operates on an array of "raw" entries shaped { c:{display,role}, title, rel,
// onsets, bpm, fp, fpDur }.  Used both by the full ETL (buildFromLibrary above)
// and by dedupFromExisting (which skips onset/tag analysis when the JSONs were
// already built — we just need to fingerprint and re-disambiguate).
async function dedupAndWrite(raw) {
  // ── Dedup pass: drop audio-identical entries ──────────────────────
  //
  // Per-artist (artists own their solos in the corpus — a track on two artists'
  // discographies is rare and meaningfully different even when fingerprints
  // match), greedy union by fingerprint similarity: BER < FP_SAME_BER plus a
  // duration match.  Within each cluster we keep the entry with the cleanest
  // path: short paths from canonical album folders beat compilations, "[*]"
  // markers (often signals an edit/clean variant in shared libraries), and
  // deeper nests like "Greatest Hits/Disc 2/…".
  const byArtist = new Map();
  for (const r of raw) { if (r) (byArtist.get(r.c.display) ?? byArtist.set(r.c.display, []).get(r.c.display)).push(r); }
  const pathScore = (rel) => {
    // Lower = better.  Penalize [*]/bracket markers and very deep paths.
    let s = rel.length;
    if (/\[[^\]]*\]/.test(rel)) s += 500;
    if (/\b(greatest\s*hits|best of|essential|the very best|compilation|anthology|disc\s*\d)/i.test(rel)) s += 300;
    s += (rel.split("/").length - 3) * 50;   // extra nesting beyond lib/Artist/Album/track.mp3
    return s;
  };
  const kept = [], dropped = [];
  for (const entries of byArtist.values()) {
    const used = new Array(entries.length).fill(false);
    for (let i = 0; i < entries.length; i++) {
      if (used[i]) continue;
      const cluster = [i];
      const a = entries[i];
      if (a.fp) {
        for (let j = i + 1; j < entries.length; j++) {
          if (used[j]) continue;
          const b = entries[j];
          if (!b.fp) continue;
          if (Math.abs(a.fpDur - b.fpDur) > FP_SAME_DUR_S) continue;
          if (fingerprintBitErrorRate(a.fp, b.fp) >= FP_SAME_BER) continue;
          cluster.push(j);
        }
      }
      cluster.sort((x, y) => pathScore(entries[x].rel) - pathScore(entries[y].rel));
      const keeper = cluster[0];
      for (const idx of cluster) used[idx] = true;
      kept.push(entries[keeper]);
      for (let k = 1; k < cluster.length; k++) dropped.push({ kept: entries[keeper].rel, dropped: entries[cluster[k]].rel });
    }
  }
  if (dropped.length) {
    console.log(`Blues: dedup dropped ${dropped.length} audio-identical entries:`);
    for (const d of dropped) console.log(`    keep ${d.kept}\n     drop ${d.dropped}`);
  }

  // ── Second pass: title + duration + relaxed-fingerprint dedup ──────
  //
  // Chromaprint at BER < 10 % (first pass above) catches truly bit-equivalent
  // files, but misses pairs that ARE the same recording yet fingerprint-differ
  // enough to clear the threshold — different masters of the same source, mp3s
  // encoded at different bitrates, or 120 s windows misaligned by a few seconds
  // of intro.  Per user direction 2026-05-30: "these basically have same name
  // are they different audio signatures? if they are the same audio signatures
  // remove one, do this for all".
  //
  // Heuristic: within an artist, group by normalized title (case-folded,
  // parenthetical suffix stripped), bucket by duration (±2 s), AND require a
  // RELAXED Chromaprint match (BER < FP_RELAXED_BER) before dropping.  The
  // relaxed BER check is what stops legitimate alternate takes (e.g. Robert
  // Johnson's DAL.397-1 vs DAL.397-2 — same song length, totally different
  // audio) from being merged: their BER is ~0.45+ and they sail through this
  // pass untouched.
  const FP_RELAXED_BER = 0.30;
  const normTitle = (t) => t.replace(/\s*\([^()]*\)\s*$/, "").replace(/\s+/g, " ").trim().toLowerCase();
  const titleGroups = new Map();
  for (const r of kept) {
    const k = `${r.c.display}|||${normTitle(r.title)}`;
    (titleGroups.get(k) ?? titleGroups.set(k, []).get(k)).push(r);
  }
  const kept2 = [];
  const dropped2 = [];
  const DUR_BUCKET_S = 2;
  for (const group of titleGroups.values()) {
    // Best-path-first so the bucket keeper is the cleanest source.
    group.sort((a, b) => pathScore(a.rel) - pathScore(b.rel));
    const accepted = [];   // { rep: r, dur: int }
    for (const r of group) {
      const dur = Math.round(r.fpDur || 0);
      if (!dur) { accepted.push({ rep: r, dur: 0 }); continue; }   // no duration → can't bucket; keep
      const hit = accepted.find(a => {
        if (!a.dur) return false;
        // Exact integer-second match: drop unconditionally.  Catches near-
        // duplicates Chromaprint reports as "different" (BER > 0.30) when
        // they're really the same source with different mastering or
        // encoding — alternate live performances of the same song virtually
        // never match to the second (verified on Robert Johnson alt takes:
        // DAL.397-1=149s vs -2=147s, DAL.395-1=133s vs -2=140s, etc.).
        if (a.dur === dur) return true;
        // Loose duration match (±2 s): requires a relaxed fingerprint match
        // too, so we don't merge unrelated takes that share a runtime within
        // rounding noise.
        if (Math.abs(a.dur - dur) > DUR_BUCKET_S) return false;
        if (!a.rep.fp || !r.fp) return false;
        return fingerprintBitErrorRate(a.rep.fp, r.fp) < FP_RELAXED_BER;
      });
      if (hit) dropped2.push({ kept: hit.rep.rel, dropped: r.rel });
      else accepted.push({ rep: r, dur });
    }
    for (const a of accepted) kept2.push(a.rep);
  }
  if (dropped2.length) {
    console.log(`Blues: title+duration+fp dedup dropped ${dropped2.length} more entries:`);
    for (const d of dropped2) console.log(`    keep ${d.kept}\n     drop ${d.dropped}`);
  }
  // Replace `kept` with the second-pass result; downstream MB disambig + write
  // operate on this narrower set.
  kept.length = 0;
  for (const r of kept2) kept.push(r);

  // ── Disambiguate remaining same-title entries via MusicBrainz ─────
  //
  // After dedup, an artist may still have multiple tracks with the same title
  // when those are genuinely different recordings (studio + live, two different
  // live nights, etc.).  For each collision, look up the canonical recordings
  // on MusicBrainz (artist + title), match each of our files to the MB
  // recording with the closest duration (±5 s), and use the matched recording's
  // `disambiguation` ("live, 1972-..." → "live 1972") or release title as the
  // version label.  Falls back to the album folder name from the path when MB
  // returns nothing usable.
  const titleCount = new Map();
  for (const r of kept) {
    const k = `${r.c.display}|||${r.title}`;
    titleCount.set(k, (titleCount.get(k) ?? 0) + 1);
  }
  const collisions = kept.filter(r => (titleCount.get(`${r.c.display}|||${r.title}`) ?? 0) > 1);
  if (collisions.length) {
    console.log(`Blues: disambiguating ${collisions.length} same-title entries via MusicBrainz…`);
    const mbCache = loadMbCache();
    // Group by (artist, title) so we only query MB once per group.
    const groups = new Map();
    for (const r of collisions) {
      const k = `${r.c.display}|||${r.title}`;
      (groups.get(k) ?? groups.set(k, []).get(k)).push(r);
    }
    for (const [key, entries] of groups) {
      const [artist, title] = key.split("|||");
      let recs = [];
      try { recs = await mbRecordings(artist, title, mbCache); }
      catch { /* network blip — fall through to path fallback */ }
      const usedLabels = new Set();
      for (const r of entries) {
        const durMs = Math.round((r.fpDur || 0) * 1000);
        const rec = pickMbVersion(recs, durMs);
        let label = rec ? mbVersionLabel(rec) : null;
        if (!label || usedLabels.has(label)) {
          // MB didn't help, or it gave the same label for two distinct files:
          // fall back to the album folder name from the library path.
          const parts = r.rel.split("/");
          const album = parts.length >= 3 ? parts[parts.length - 2] : "";
          if (album) label = album;
        }
        if (label) {
          r.title = `${r.title} (${label})`;
          usedLabels.add(label);
        }
      }
    }
    saveMbCache(mbCache);
  }

  // Two separate sources: Blues Guitar and Blues Vocal (the role IS the source,
  // so style is just the player — the Styles filter then organises by artist).
  const guitar = [], vocal = [];
  for (const r of kept) {
    const source = r.c.role === "Vocals" ? "bluesvocal" : "bluesguitar";
    const bucket = source === "bluesvocal" ? vocal : guitar;
    bucket.push({
      id: `${source}-${bucket.length}`, source, genre: "Blues",
      style: r.c.display, title: r.title, artist: r.c.display,
      key: { tonicPc: 0, mode: "major" },
      timeSig: [4, 4], tempoBpm: r.bpm, barCount: 1,
      audio: encPath(r.rel), onsets: r.onsets,
      youtubeQuery: `${r.c.display} ${r.title}`,
    });
  }
  console.log(`Blues: built ${guitar.length} guitar + ${vocal.length} vocal tracks (after dedup)`);
  writeSource("bluesguitar", guitar);
  writeSource("bluesvocal", vocal);
}

// ── Re-dedup an already-built corpus (no onset / tag re-analysis) ────
//
// Reads the existing bluesguitar.json + bluesvocal.json, fingerprints each
// referenced audio file (using the cache so unchanged files are instant),
// then re-runs dedup + MB rename and writes both sources back out.  Lets us
// iterate on the dedup/rename logic without paying the multi-minute cost of
// re-running ffprobe and the Python onset detector across the whole library.
export async function dedupFromExisting() {
  const TX_DIR = join(__dirname, "..", "..", "public", "transcriptions");
  const sources = ["bluesguitar", "bluesvocal"];
  const fpCache = loadFpCache();
  // Strip any pre-existing "(...)" disambiguator suffix on existing titles
  // (added by an earlier run of this same pass) so we re-derive a clean
  // version label each time instead of compounding parens.
  const stripPrevDisambig = (t) => t.replace(/\s*\([^()]*\)\s*$/, "").trim();
  const items = [];
  for (const src of sources) {
    let entries;
    try { entries = JSON.parse(readFileSync(join(TX_DIR, `${src}.json`), "utf8")); }
    catch { console.warn(`  ${src}.json missing — skipping`); continue; }
    for (const e of entries) items.push({ src, e });
  }
  console.log(`Blues: re-dedup of ${items.length} existing entries`);
  let fpDone = 0;
  // The c.role drives the bluesguitar-vs-bluesvocal split downstream; rebuild
  // the {display, role} shape that dedupAndWrite expects from each entry's
  // source key.  rel is the decoded library path; audio in the JSON is URL-
  // encoded so decode each segment before joining.
  const decRel = (audio) => audio.split("/").map(decodeURIComponent).join("/");
  const raw = await pool(items, 8, async ({ src, e }) => {
    if (++fpDone % 200 === 0) console.log(`  …${fpDone}/${items.length}`);
    const rel = decRel(e.audio);
    const abs = join(__dirname, "..", "..", "public", "blues", rel);
    if (!existsSync(abs)) return null;
    const key = fpCacheKey(abs);
    let fp = null, fpDur = 0;
    const hit = fpCache[abs];
    if (hit && hit.key === key && Array.isArray(hit.fp)) {
      fp = new Uint32Array(hit.fp); fpDur = hit.dur ?? 0;
    } else {
      const res = await fpcalcRaw(abs);
      if (res) {
        fp = res.fp; fpDur = res.dur;
        fpCache[abs] = { key, dur: fpDur, fp: Array.from(res.fp) };
      }
    }
    return {
      c: { display: e.artist, role: src === "bluesvocal" ? "Vocals" : "Guitar" },
      title: stripPrevDisambig(e.title),
      rel,
      onsets: e.onsets || [],
      bpm: e.tempoBpm || 100,
      fp, fpDur,
    };
  });
  saveFpCache(fpCache);
  await dedupAndWrite(raw.filter(Boolean));
}

const args = process.argv.slice(2);
if (isMain(import.meta.url)) {
  const fn = args.includes("--existing") ? dedupFromExisting : buildFromLibrary;
  fn().then(rebuildIndex).catch(e => { console.error(e); process.exit(1); });
}
