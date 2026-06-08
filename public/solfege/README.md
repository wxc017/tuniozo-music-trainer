# Solfège audio (drop-in mp3s)

The app plays each solfège syllable from a bundled mp3 **if present in this
folder**, before falling back to the Polly endpoint or browser speech.

## How to populate

1. Go to **https://ipa-reader.com/**, pick a voice you like (keep it consistent).
2. For each row below, paste the **IPA** into the box, generate, and **download**
   the mp3.
3. Rename the file to the **Filename** in the last column and drop it in this
   folder (`App/public/solfege/`).

Filenames are the syllable, lower-cased, letters/digits only, `.mp3`.
You don't have to do all of them — any syllable without an mp3 just falls back.

| Syllable | IPA   | Filename     |
|----------|-------|--------------|
| A        | a     | a.mp3        |
| O        | ɒ     | o.mp3        |
| Ee       | i     | ee.mp3       |
| Sais     | saɪs  | sais.mp3     |
| Sai      | saɪ   | sai.mp3      |
| Sail     | saɪl  | sail.mp3     |
| Soos     | sus   | soos.mp3     |
| Soo      | su    | soo.mp3      |
| Sool     | sul   | sool.mp3     |
| Ha       | ha    | ha.mp3       |
| Says     | seɪs  | says.mp3     |
| Say      | seɪ   | say.mp3      |
| Sayl     | seɪl  | sayl.mp3     |
| Fe       | fɛ    | fe.mp3       |
| Thais    | θaɪs  | thais.mp3    |
| Thai     | θaɪ   | thai.mp3     |
| Thail    | θaɪl  | thail.mp3    |
| Thoos    | θus   | thoos.mp3    |
| Thoo     | θu    | thoo.mp3     |
| Thool    | θul   | thool.mp3    |
| Thays    | θeɪs  | thays.mp3    |
| Thay     | θeɪ   | thay.mp3     |
| Thayl    | θeɪl  | thayl.mp3    |
| Ke       | kɛ    | ke.mp3       |
| Fos      | fɔs   | fos.mp3      |
| Fo       | fɔ    | fo.mp3       |
| Fol      | fɔl   | fol.mp3      |
| Foo      | fu    | foo.mp3      |
| Trais    | traɪs | trais.mp3    |
| Trai     | traɪ  | trai.mp3     |
| Trail    | traɪl | trail.mp3    |
| Fu       | fʌ    | fu.mp3       |
| Fis      | fɪs   | fis.mp3      |
| Fi       | fɪ    | fi.mp3       |
| Fil      | fɪl   | fil.mp3      |
| Te       | tɛ    | te.mp3       |
| Kais     | kaɪs  | kais.mp3     |
| Kai      | kaɪ   | kai.mp3      |
| Kail     | kaɪl  | kail.mp3     |
| Koos     | kus   | koos.mp3     |
| Koo      | ku    | koo.mp3      |
| Kool     | kul   | kool.mp3     |
| Kays     | keɪs  | kays.mp3     |
| Kay      | keɪ   | kay.mp3      |
| Kayl     | keɪl  | kayl.mp3     |
| Twe      | twɛ   | twe.mp3      |
| Vais     | vaɪs  | vais.mp3     |
| Vai      | vaɪ   | vai.mp3      |
| Vail     | vaɪl  | vail.mp3     |
| Ho       | hɒ    | ho.mp3       |
| Voos     | vus   | voos.mp3     |
| Voo      | vu    | voo.mp3      |
| Vool     | vul   | vool.mp3     |
| Vays     | veɪs  | vays.mp3     |
| Vay      | veɪ   | vay.mp3      |
| Vayl     | veɪl  | vayl.mp3     |
| Dee      | di    | dee.mp3      |
| Co       | kɒ    | co.mp3       |

A machine-readable copy is in `manifest.json` (solfège → IPA).
