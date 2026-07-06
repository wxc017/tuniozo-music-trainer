import { Component, Suspense, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, Html } from "@react-three/drei";
import * as THREE from "three";
import type { Pose, Vec3 } from "@/lib/calisthenicsPoses";

// ── Skeleton proportions (metres) ──────────────────────────────────────────
const SEG = {
  pelvisToSpine: 0.18, spineToChest: 0.20, chestToNeck: 0.10, neckToHead: 0.14,
  shoulderX: 0.22, shoulderY: 0.02, upperArm: 0.30, foreArm: 0.28,
  hipX: 0.11, pelvisDrop: 0.06, thigh: 0.44, shin: 0.42,
};

const BODY_COLOR = "#6d6f86";
const JOINT_COLOR = "#4c4e63";
const RING_COLOR = "#c8a24b";
const STRAP_COLOR = "#8a8a95";
const FRAME_COLOR = "#33333c";

// FIG apparatus norms: rings 50cm apart (centres), 18cm inner diameter,
// hung from a high suspension point.
const ANCHOR_Y = 1.95;            // height of the top beam the cables hang from
const ANCHOR_X = 0.25;            // half-gap between cables → rings 50cm apart
const RING_REST_Y = 0.0;          // resting ring height when nothing grips them

const HUMAN_URL = "/models/human.glb";

const d2r = (d: number) => (d * Math.PI) / 180;
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const lerp3 = (a: Vec3, b: Vec3, u: number): Vec3 =>
  [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];

const JOINT_KEYS = [
  "spine", "chest", "neck", "shoulderL", "elbowL", "shoulderR", "elbowR",
  "hipL", "kneeL", "hipR", "kneeR",
] as const;
type JointKey = typeof JOINT_KEYS[number];

const angleOf = (p: Pose, k: JointKey): Vec3 => (p.joints as any)[k] ?? [0, 0, 0];
const rootRot = (p: Pose): Vec3 => p.root.rotation ?? [0, 0, 0];
const rootPos = (p: Pose): Vec3 => p.root.position ?? [0, 0, 0];

// ── Small reusable meshes ───────────────────────────────────────────────────
function Bone({ len, radius, color = BODY_COLOR }: { len: number; radius: number; color?: string }) {
  return (
    <mesh position={[0, -len / 2, 0]}>
      <capsuleGeometry args={[radius, Math.max(0.001, len - radius * 2), 6, 14]} />
      <meshStandardMaterial color={color} roughness={0.65} metalness={0.05} />
    </mesh>
  );
}

function Joint({ r = 0.05 }: { r?: number }) {
  return (
    <mesh>
      <sphereGeometry args={[r, 12, 12]} />
      <meshStandardMaterial color={JOINT_COLOR} roughness={0.6} />
    </mesh>
  );
}

// ── The rig the rings hang off ──────────────────────────────────────────────
function RigFrame() {
  const beamY = ANCHOR_Y + 0.09;
  const floorY = -0.95;
  const postX = 0.95;             // wide, stable stance
  const postH = beamY - floorY;
  const beamMat = <meshStandardMaterial color={FRAME_COLOR} metalness={0.55} roughness={0.45} />;
  return (
    <group>
      {/* top beam — spans the full frame width */}
      <mesh position={[0, beamY, -0.04]}>
        <boxGeometry args={[postX * 2 + 0.16, 0.1, 0.1]} />
        {beamMat}
      </mesh>
      {/* uprights */}
      {[-postX, postX].map((x) => (
        <mesh key={x} position={[x, beamY - postH / 2, -0.04]}>
          <boxGeometry args={[0.1, postH, 0.1]} />
          {beamMat}
        </mesh>
      ))}
      {/* feet */}
      {[-postX, postX].map((x) => (
        <mesh key={`f${x}`} position={[x, floorY + 0.03, 0.1]}>
          <boxGeometry args={[0.14, 0.06, 0.5]} />
          {beamMat}
        </mesh>
      ))}
      {/* faint floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY, 0]}>
        <circleGeometry args={[1.5, 48]} />
        <meshStandardMaterial color="#101018" roughness={1} />
      </mesh>
    </group>
  );
}

// ── Rings + straps. Follow the wrists when given, else hang at rest. ─────────
function RingRig({ wristL, wristR }: {
  wristL?: React.RefObject<THREE.Object3D | null>;
  wristR?: React.RefObject<THREE.Object3D | null>;
}) {
  const ringL = useRef<THREE.Mesh>(null);
  const ringR = useRef<THREE.Mesh>(null);
  const strapL = useRef<THREE.Mesh>(null);
  const strapR = useRef<THREE.Mesh>(null);
  const v = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const anchorL = useMemo(() => new THREE.Vector3(-ANCHOR_X, ANCHOR_Y, 0), []);
  const anchorR = useMemo(() => new THREE.Vector3(ANCHOR_X, ANCHOR_Y, 0), []);

  const place = (
    wrist: THREE.Object3D | null | undefined,
    ring: THREE.Mesh | null, strap: THREE.Mesh | null, anchor: THREE.Vector3,
  ) => {
    if (!ring || !strap) return;
    if (wrist) wrist.getWorldPosition(v);
    else v.set(anchor.x, RING_REST_Y, 0);
    ring.position.copy(v);
    dir.subVectors(v, anchor);
    const len = dir.length() || 0.001;
    strap.position.set((v.x + anchor.x) / 2, (v.y + anchor.y) / 2, (v.z + anchor.z) / 2);
    q.setFromUnitVectors(up, dir.normalize());
    strap.quaternion.copy(q);
    strap.scale.set(1, len, 1);
  };

  useFrame(() => {
    place(wristL?.current, ringL.current, strapL.current, anchorL);
    place(wristR?.current, ringR.current, strapR.current, anchorR);
  });

  return (
    <>
      {[ringL, ringR].map((r, i) => (
        <mesh key={i} ref={r}>
          <torusGeometry args={[0.104, 0.014, 16, 36]} />
          <meshStandardMaterial color={RING_COLOR} metalness={0.3} roughness={0.4} />
        </mesh>
      ))}
      {[strapL, strapR].map((r, i) => (
        <mesh key={i} ref={r}>
          <cylinderGeometry args={[0.009, 0.009, 1, 8]} />
          <meshStandardMaterial color={STRAP_COLOR} roughness={0.8} />
        </mesh>
      ))}
    </>
  );
}

// ── Posed primitive figure (fallback + default) ─────────────────────────────
function PrimitiveFigure({ frames, playing, speed }: { frames: Pose[]; playing: boolean; speed: number }) {
  const root = useRef<THREE.Group>(null);
  const refs = useRef<Record<string, THREE.Group | null>>({});
  const wristL = useRef<THREE.Object3D>(null);
  const wristR = useRef<THREE.Object3D>(null);
  const t = useRef(0);

  const setRef = (k: string) => (el: THREE.Group | null) => { refs.current[k] = el; };

  const apply = (pose: (k: JointKey) => Vec3, rr: Vec3, rp: Vec3) => {
    for (const k of JOINT_KEYS) {
      const g = refs.current[k];
      if (g) { const val = pose(k); g.rotation.set(d2r(val[0]), d2r(val[1]), d2r(val[2])); }
    }
    if (root.current) {
      root.current.rotation.set(d2r(rr[0]), d2r(rr[1]), d2r(rr[2]));
      root.current.position.set(rp[0], rp[1], rp[2]);
    }
  };

  useFrame((_, delta) => {
    if (frames.length <= 1) {
      const f = frames[0];
      apply((k) => angleOf(f, k), rootRot(f), rootPos(f));
      return;
    }
    if (playing) t.current += delta * 0.5 * speed;
    const n = frames.length - 1;
    const cyc = t.current % 2;
    const tri = cyc < 1 ? cyc : 2 - cyc;
    const p = tri * n;
    const i = Math.min(Math.floor(p), n - 1);
    const u = p - i;
    const a = frames[i], b = frames[i + 1];
    apply(
      (k) => lerp3(angleOf(a, k), angleOf(b, k), u),
      lerp3(rootRot(a), rootRot(b), u),
      lerp3(rootPos(a), rootPos(b), u),
    );
  });

  const S = SEG;
  return (
    <>
      <group ref={root}>
        <Joint r={0.07} />
        <mesh position={[0, S.pelvisToSpine / 2, 0]}>
          <capsuleGeometry args={[0.12, S.pelvisToSpine, 6, 14]} />
          <meshStandardMaterial color={BODY_COLOR} roughness={0.65} />
        </mesh>

        <group ref={setRef("spine")} position={[0, S.pelvisToSpine, 0]}>
          <mesh position={[0, S.spineToChest / 2, 0]}>
            <capsuleGeometry args={[0.135, S.spineToChest, 6, 14]} />
            <meshStandardMaterial color={BODY_COLOR} roughness={0.65} />
          </mesh>

          <group ref={setRef("chest")} position={[0, S.spineToChest, 0]}>
            <group ref={setRef("neck")} position={[0, S.chestToNeck, 0]}>
              <mesh position={[0, S.neckToHead, 0]}>
                <sphereGeometry args={[0.12, 18, 18]} />
                <meshStandardMaterial color={BODY_COLOR} roughness={0.65} />
              </mesh>
            </group>

            <group ref={setRef("shoulderL")} position={[-S.shoulderX, S.shoulderY, 0]}>
              <Joint r={0.06} />
              <Bone len={S.upperArm} radius={0.05} />
              <group ref={setRef("elbowL")} position={[0, -S.upperArm, 0]}>
                <Joint r={0.04} />
                <Bone len={S.foreArm} radius={0.045} />
                <group ref={wristL as any} position={[0, -S.foreArm, 0]} />
              </group>
            </group>

            <group ref={setRef("shoulderR")} position={[S.shoulderX, S.shoulderY, 0]}>
              <Joint r={0.06} />
              <Bone len={S.upperArm} radius={0.05} />
              <group ref={setRef("elbowR")} position={[0, -S.upperArm, 0]}>
                <Joint r={0.04} />
                <Bone len={S.foreArm} radius={0.045} />
                <group ref={wristR as any} position={[0, -S.foreArm, 0]} />
              </group>
            </group>
          </group>
        </group>

        <group ref={setRef("hipL")} position={[-S.hipX, -S.pelvisDrop, 0]}>
          <Joint />
          <Bone len={S.thigh} radius={0.07} />
          <group ref={setRef("kneeL")} position={[0, -S.thigh, 0]}>
            <Joint r={0.045} />
            <Bone len={S.shin} radius={0.055} />
            <mesh position={[0, -S.shin, 0.03]}>
              <boxGeometry args={[0.07, 0.05, 0.16]} />
              <meshStandardMaterial color={JOINT_COLOR} roughness={0.6} />
            </mesh>
          </group>
        </group>

        <group ref={setRef("hipR")} position={[S.hipX, -S.pelvisDrop, 0]}>
          <Joint />
          <Bone len={S.thigh} radius={0.07} />
          <group ref={setRef("kneeR")} position={[0, -S.thigh, 0]}>
            <Joint r={0.045} />
            <Bone len={S.shin} radius={0.055} />
            <mesh position={[0, -S.shin, 0.03]}>
              <boxGeometry args={[0.07, 0.05, 0.16]} />
              <meshStandardMaterial color={JOINT_COLOR} roughness={0.6} />
            </mesh>
          </group>
        </group>
      </group>

      <RingRig wristL={wristL} wristR={wristR} />
    </>
  );
}

// ── Realistic GLB human (loads /models/human.glb when present) ───────────────
// Placeholder rigged human: Cesium Man (Khronos glTF sample, CC-BY — credit
// Cesium). Swap the file for any rigged .glb and keep the same path.
// These transform constants are the first thing to tune in the see-loop.
const GLB_SCALE = 1.0;
const GLB_POS: [number, number, number] = [0, -0.95, 0];
const GLB_ROT: [number, number, number] = [0, 0, 0];

function GlbHuman() {
  const gltf = useGLTF(HUMAN_URL);
  return (
    <>
      <primitive object={gltf.scene} position={GLB_POS} rotation={GLB_ROT} scale={GLB_SCALE} />
      <RingRig />
    </>
  );
}

class GlbBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() { return { err: true }; }
  render() { return this.state.err ? this.props.fallback : this.props.children; }
}

type Props = { frames: Pose[]; animated: boolean };

export default function SkillPose3D({ frames, animated }: Props) {
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [realistic, setRealistic] = useState(false);

  const primitive = <PrimitiveFigure frames={frames} playing={playing} speed={speed} />;

  return (
    <div className="w-full">
      <div className="w-full h-[380px] rounded-lg overflow-hidden bg-gradient-to-b from-[#14141c] to-[#08080c] border border-[#1e1e1e]">
        <Canvas camera={{ position: [2.6, 0.9, 3.3], fov: 44 }}>
          <ambientLight intensity={0.7} />
          <directionalLight position={[3, 5, 2]} intensity={1.1} />
          <directionalLight position={[-3, 2, -2]} intensity={0.4} />
          <RigFrame />
          {realistic ? (
            <GlbBoundary
              fallback={
                <>
                  {primitive}
                  <Html center position={[0, 1.0, 0]}>
                    <div className="text-[10px] text-[#c98a2b] whitespace-nowrap bg-[#0a0a0e]/80 px-2 py-1 rounded">
                      Drop human.glb in public/models/
                    </div>
                  </Html>
                </>
              }
            >
              <Suspense fallback={primitive}>
                <GlbHuman />
              </Suspense>
            </GlbBoundary>
          ) : primitive}
          <OrbitControls enablePan={false} minDistance={1.6} maxDistance={7} target={[0, 0.5, 0]} />
        </Canvas>
      </div>

      {/* controls */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {animated && (
          <>
            <button onClick={() => setPlaying(p => !p)}
              className="px-3 py-1.5 rounded text-xs font-medium bg-[#7173e6] text-white hover:bg-[#5f61d6]">
              {playing ? "⏸ Pause" : "▶ Play"}
            </button>
            <div className="flex rounded overflow-hidden border border-[#2a2a2a]">
              {[0.5, 1, 2].map(s => (
                <button key={s} onClick={() => setSpeed(s)}
                  className={`px-2.5 py-1.5 text-xs font-medium ${
                    speed === s ? "bg-[#1c1c2e] text-white" : "bg-[#141414] text-[#888] hover:text-white"
                  }`}>
                  {s}×
                </button>
              ))}
            </div>
          </>
        )}
        <button onClick={() => setRealistic(r => !r)}
          className={`px-3 py-1.5 rounded text-xs font-medium border ${
            realistic ? "bg-[#1c1c2e] text-white border-[#7173e6]/50" : "bg-[#141414] text-[#888] border-[#2a2a2a] hover:text-white"
          }`}>
          {realistic ? "◉ Realistic model" : "○ Realistic model"}
        </button>
        <span className="text-[11px] text-[#666] ml-auto">
          {animated ? "Transition — looping · " : ""}drag to orbit, scroll to zoom
        </span>
      </div>
    </div>
  );
}
