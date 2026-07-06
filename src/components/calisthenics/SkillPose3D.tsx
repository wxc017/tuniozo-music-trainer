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
const FLOOR_Y = -0.95;            // ground plane / feet height

const HUMAN_URL = "/models/human.glb";
const RINGS_URL = "/models/rings.glb";

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

// ── Ground plane ────────────────────────────────────────────────────────────
function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y, 0]}>
      <circleGeometry args={[1.7, 48]} />
      <meshStandardMaterial color="#101018" roughness={1} />
    </mesh>
  );
}

// ── Real gymnastic rings apparatus (rings + straps) ─────────────────────────
// Authored lying flat; rotate to hang, then pin the strap tops to a high point.
const RINGS_TOP_Y = 2.7;                            // suspension height (high)
const RINGS_ROT: [number, number, number] = [90, 0, 0]; // rings hang below straps

function RingsModel() {
  const gltf = useGLTF(RINGS_URL);
  const scene = useMemo(() => {
    const s = gltf.scene.clone(true);
    s.rotation.set(d2r(RINGS_ROT[0]), d2r(RINGS_ROT[1]), d2r(RINGS_ROT[2]));
    s.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(s);
    s.position.y += RINGS_TOP_Y - box.max.y;         // hang from the high anchor
    s.position.x -= (box.min.x + box.max.x) / 2;     // centre
    s.position.z -= (box.min.z + box.max.z) / 2;
    return s;
  }, [gltf]);
  return <primitive object={scene} />;
}
useGLTF.preload(RINGS_URL);

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
// Rigged human at public/models/human.glb (Mixamo skeleton). The loader
// auto-fits any rigged .glb: scales to human height and drops feet to the floor.
const GLB_TARGET_H = 1.75;        // metres, standing height to normalise to
const GLB_ROT: [number, number, number] = [0, 0, 0]; // extra rotation if needed

function GlbHuman() {
  const gltf = useGLTF(HUMAN_URL);
  // Do NOT clone a skinned mesh (breaks the skeleton). Fit via a wrapper group.
  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const scale = GLB_TARGET_H / (size.y || 1);
    const position: [number, number, number] = [
      -((box.min.x + box.max.x) / 2) * scale,
      FLOOR_Y - box.min.y * scale,
      -((box.min.z + box.max.z) / 2) * scale,
    ];
    return { scale, position };
  }, [gltf]);

  return (
    <group position={fit.position} scale={fit.scale} rotation={[d2r(GLB_ROT[0]), d2r(GLB_ROT[1]), d2r(GLB_ROT[2])]}>
      <primitive object={gltf.scene} />
    </group>
  );
}

class GlbBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() { return { err: true }; }
  render() { return this.state.err ? this.props.fallback : this.props.children; }
}

type Props = { frames: Pose[]; animated: boolean };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function SkillPose3D({ frames, animated }: Props) {
  return (
    <div className="w-full">
      <div className="w-full h-[420px] rounded-lg overflow-hidden bg-gradient-to-b from-[#14141c] to-[#08080c] border border-[#1e1e1e]">
        <Canvas camera={{ position: [2.9, 1.2, 3.7], fov: 44 }}>
          <ambientLight intensity={0.75} />
          <directionalLight position={[3, 5, 2]} intensity={1.15} />
          <directionalLight position={[-3, 2, -2]} intensity={0.4} />
          <Ground />
          <GlbBoundary
            fallback={
              <Html center position={[0, 1.0, 0]}>
                <div className="text-[10px] text-[#c98a2b] whitespace-nowrap bg-[#0a0a0e]/80 px-2 py-1 rounded">
                  Missing model in public/models/
                </div>
              </Html>
            }
          >
            <Suspense fallback={null}>
              <RingsModel />
              <GlbHuman />
            </Suspense>
          </GlbBoundary>
          <OrbitControls enablePan={false} minDistance={1.6} maxDistance={8} target={[0, 0.7, 0]} />
        </Canvas>
      </div>

      <div className="flex items-center gap-2 mt-2">
        <span className="text-[11px] text-[#666]">Drag to orbit · scroll to zoom</span>
      </div>
    </div>
  );
}
