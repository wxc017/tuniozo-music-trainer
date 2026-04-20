import type { ReactNode } from "react";

function HalfSharpGlyph() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 105.60996 200"
      style={{ display: "inline-block", height: "1em", width: "auto", verticalAlign: "-0.15em" }}>
      <g transform="translate(-298.62359,-509.66459)">
        <g transform="matrix(12.481328,0,0,12.481328,345.18791,-12431.763)"
          fill="none" stroke="currentColor" strokeLinecap="square">
          <path strokeWidth="1" d="m 0.5,1037.831 0,14.0625" />
          <path strokeWidth="1.7598561" d="m -2.1200719,1048.4823 5.2401438,-2.0686" />
          <path strokeWidth="1.7598561" d="m 3.1200719,1041.2421 -5.2401438,2.0686" />
        </g>
      </g>
    </svg>
  );
}

function HalfFlatGlyph() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 76.963211 200"
      style={{ display: "inline-block", height: "1em", width: "auto", verticalAlign: "-0.15em" }}>
      <g transform="translate(-5.3969506,-70.87545)">
        <path fill="currentColor"
          d="m 68.127504,264.49928 c -0.478808,-0.19387 -2.947079,-3.01177 -5.485045,-6.262 -2.87886,-3.68679 -6.959104,-7.73635 -10.848091,-10.76648 -22.338102,-17.40491 -29.071897,-23.45747 -33.73141,-30.31891 -5.869037,-8.64254 -7.87251,-18.09848 -5.970977,-28.18166 2.796006,-14.82628 12.013074,-24.93954 24.235903,-26.59242 7.15555,-0.96763 19.712388,2.43157 26.898878,7.28167 l 3.285527,2.21738 0,-46.00644 0,-46.00643 1.519682,-1.631186 c 1.214864,-1.304004 2.013528,-1.551045 3.981793,-1.23164 1.354161,0.219751 2.89734,0.97342 3.429281,1.674821 1.170171,1.542956 1.159146,0.15312 0.31452,39.627225 -0.376117,17.57798 -1.005267,51.77513 -1.398112,75.99368 -0.946245,58.33479 -1.325524,68.30525 -2.64869,69.62841 -1.054882,1.05488 -2.015504,1.20876 -3.583259,0.57398 z m -1.931106,-27.00037 c 0.901363,-8.41682 -0.10833,-42.7111 -1.377454,-46.78526 -1.684298,-5.40697 -4.999163,-9.94103 -8.510733,-11.64095 -6.338637,-3.06848 -12.104085,-1.29648 -15.841794,4.86895 -6.535387,10.78027 -4.053063,26.4838 6.35214,40.18454 3.64509,4.79956 16.961045,18.11064 18.117275,18.11064 0.414247,0 0.981502,-2.13207 1.260566,-4.73792 z" />
      </g>
    </svg>
  );
}

const ACCIDENTAL_PATTERN = /##|bb|𝄲|𝄳|𝄪|𝄫/g;

function isHalfSharp(match: string): boolean {
  return match === "##" || match === "𝄲" || match === "𝄪";
}

/**
 * Split a string around "##"/"bb" (or their Unicode equivalents) and replace
 * each occurrence with an inline SVG half-sharp / half-flat glyph that
 * inherits the surrounding text color via `currentColor`.
 */
export function renderAccidentals(s: string): ReactNode {
  if (!s) return s;
  const parts: ReactNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  ACCIDENTAL_PATTERN.lastIndex = 0;
  while ((m = ACCIDENTAL_PATTERN.exec(s)) !== null) {
    if (m.index > last) parts.push(s.slice(last, m.index));
    parts.push(isHalfSharp(m[0]) ? <HalfSharpGlyph key={i++} /> : <HalfFlatGlyph key={i++} />);
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push(s.slice(last));
  if (parts.length === 0) return s;
  if (parts.length === 1) return parts[0];
  return <>{parts}</>;
}
