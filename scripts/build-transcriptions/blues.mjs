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
import { execFileSync, execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";
import { writeSource, rebuildIndex, isMain } from "./common.mjs";

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

function ffTags(file) {
  try {
    const out = execSync(`ffprobe -v quiet -show_entries "format=duration:format_tags=artist,album_artist,title" -of json "${file}"`, { encoding: "utf8", maxBuffer: 1 << 24 });
    const fmt = (JSON.parse(out).format) || {};
    const t = fmt.tags || {};
    return { dur: parseFloat(fmt.duration) || 0, artist: t.album_artist || t.artist || "", title: t.title || "" };
  } catch { return { dur: 0, artist: "", title: "" }; }
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
  console.log(`Blues: scanning ${files.length} audio files…`);
  const items = [];
  let skipped = 0;
  for (const abs of files) {
    // Path relative to public/blues/ (so it includes the `lib/` segment the app
    // serves from): public/blues/lib/<...> → "lib/<...>".
    const rel = "lib/" + abs.slice(LIB_DIR.length + 1).replace(/\\/g, "/");
    const { dur, artist: tagArtist, title: tagTitle } = ffTags(abs);
    if (dur < 45) { skipped++; continue; }                 // intros/skits/interludes
    const c = resolveArtist(tagArtist, rel);
    if (!c) { skipped++; continue; }                       // can't attribute → skip
    const title = (tagTitle || rel.split("/").pop().replace(AUDIO_EXT, "")).trim();
    // Clip heuristic: start ~30% in (skip intro/first verse), clamped so the
    // window fits; the bars slider re-sizes the clip at play time.
    const solostart = Math.round(Math.min(Math.max(dur * 0.3, 10), Math.max(10, dur - 26)));
    items.push({
      id: `blues-${items.length}`, source: "blues", genre: "Blues",
      style: `${c.display} (${c.role})`, title, artist: c.display,
      key: { tonicPc: 0, mode: "major" },
      timeSig: [4, 4], tempoBpm: 100, barCount: 1,
      audio: encPath(rel), solostart, soloLen: WINDOW,
      youtubeQuery: `${c.display} ${title}`,
    });
    if (items.length % 200 === 0) console.log(`  …${items.length} tracks`);
  }
  const byRole = items.reduce((m, i) => (m[i.style.includes("(Vocals)") ? "Vocals" : "Guitar"]++, m), { Guitar: 0, Vocals: 0 });
  console.log(`Blues: built ${items.length} tracks (${byRole.Guitar} guitar, ${byRole.Vocals} vocals); skipped ${skipped}`);
  writeSource("blues", items);
}

if (isMain(import.meta.url)) buildFromLibrary().then(rebuildIndex).catch(e => { console.error(e); process.exit(1); });
