import { Component, Suspense, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
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
const RING_RADIUS = 0.104;        // torus ring radius (hand grips the top)

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

// Interpolated pose sample for a given loop phase `t` (frames play
// start→end→start on a triangle wave, matching the primitive figure).
interface Sampled { angle: (k: JointKey) => Vec3; rr: Vec3; rp: Vec3 }
function sampleFrames(frames: Pose[], t: number): Sampled {
  if (frames.length <= 1) {
    const f = frames[0];
    return { angle: (k) => angleOf(f, k), rr: rootRot(f), rp: rootPos(f) };
  }
  const n = frames.length - 1;
  const cyc = t % 2;
  const tri = cyc < 1 ? cyc : 2 - cyc;
  const p = tri * n;
  const i = Math.min(Math.floor(p), n - 1);
  const u = p - i;
  const a = frames[i], b = frames[i + 1];
  return {
    angle: (k) => lerp3(angleOf(a, k), angleOf(b, k), u),
    rr: lerp3(rootRot(a), rootRot(b), u),
    rp: lerp3(rootPos(a), rootPos(b), u),
  };
}

// Forward-kinematics of the arms-down reference rig: given a pose's joint
// angles, return the unit direction each limb segment points, expressed in the
// pose's own local frame (+X right, +Y up, +Z toward camera, arms hanging at
// rest).  These directions are what we aim the realistic model's bones at, so
// the (already-tuned) pose angles drive the GLB regardless of its rig axes.
const DOWN = new THREE.Vector3(0, -1, 0);
function eulerQ(v: Vec3): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(d2r(v[0]), d2r(v[1]), d2r(v[2]), "XYZ"));
}
function segmentDirs(angle: (k: JointKey) => Vec3): Record<string, THREE.Vector3> {
  const torso = eulerQ(angle("spine")).multiply(eulerQ(angle("chest")));
  const shL = torso.clone().multiply(eulerQ(angle("shoulderL")));
  const shR = torso.clone().multiply(eulerQ(angle("shoulderR")));
  const elL = shL.clone().multiply(eulerQ(angle("elbowL")));
  const elR = shR.clone().multiply(eulerQ(angle("elbowR")));
  const hipL = eulerQ(angle("hipL"));
  const hipR = eulerQ(angle("hipR"));
  const knL = hipL.clone().multiply(eulerQ(angle("kneeL")));
  const knR = hipR.clone().multiply(eulerQ(angle("kneeR")));
  const ap = (q: THREE.Quaternion) => DOWN.clone().applyQuaternion(q).normalize();
  return {
    upperArmL: ap(shL), foreArmL: ap(elL), upperArmR: ap(shR), foreArmR: ap(elR),
    thighL: ap(hipL), shinL: ap(knL), thighR: ap(hipR), shinR: ap(knR),
  };
}

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

// ── Rings + straps. Follow the wrists when given, else hang at rest. ─────────
// One clean torus ring per side with a single strap up to the ceiling anchor.
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
  const anchor = useMemo(() => new THREE.Vector3(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  const place = (
    wrist: THREE.Object3D | null | undefined,
    ring: THREE.Mesh | null, strap: THREE.Mesh | null, side: number,
  ) => {
    if (!ring || !strap) return;
    if (wrist) wrist.getWorldPosition(v);
    else v.set(side * ANCHOR_X, RING_REST_Y, 0);
    // Straps hang straight down: anchor the ceiling point directly above the
    // hand (same x/z), so each strap is vertical and they never cross.
    anchor.set(wrist ? v.x : side * ANCHOR_X, ANCHOR_Y, wrist ? v.z : 0);
    // The hand grips the TOP of the ring, so the ring hangs one radius below
    // the wrist (rather than floating centred on it) and the strap runs from
    // the ceiling anchor down to the hand (= ring top).
    ring.position.set(v.x, v.y - RING_RADIUS, v.z);
    dir.subVectors(v, anchor);
    const len = dir.length() || 0.001;
    strap.position.set((v.x + anchor.x) / 2, (v.y + anchor.y) / 2, (v.z + anchor.z) / 2);
    q.setFromUnitVectors(up, dir.normalize());
    strap.quaternion.copy(q);
    strap.scale.set(1, len, 1);
  };

  useFrame(() => {
    place(wristL?.current, ringL.current, strapL.current, -1);
    place(wristR?.current, ringR.current, strapR.current, 1);
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

// ── Realistic GLB human, posed & animated per skill ─────────────────────────
// Rigged Mixamo human at public/models/human.glb. We drive its bones each
// frame: run the (arms-down) pose angles through segmentDirs() to get where
// each limb should point, then aim the corresponding Mixamo bone there. The
// aim is done in the armature's own space (auto-detected from the rig), so it
// works despite the T-pose rest and Mixamo's bone axes.
const GLB_TARGET_H = 1.75;        // metres, standing height to normalise to
const PIVOT_Y = 0.0;              // world height of the body-centre pivot (tune)

// Mixamo bone name → the segmentDirs key that aims it, plus its child bone
// (the bone "points at" its child; that defines its aim axis).
const LIMB_BONES: { bone: string; child: string; dir: string }[] = [
  { bone: "LeftArm",      child: "LeftForeArm", dir: "upperArmL" },
  { bone: "LeftForeArm",  child: "LeftHand",    dir: "foreArmL" },
  { bone: "RightArm",     child: "RightForeArm", dir: "upperArmR" },
  { bone: "RightForeArm", child: "RightHand",   dir: "foreArmR" },
  { bone: "LeftUpLeg",    child: "LeftLeg",     dir: "thighL" },
  { bone: "LeftLeg",      child: "LeftFoot",    dir: "shinL" },
  { bone: "RightUpLeg",   child: "RightLeg",    dir: "thighR" },
  { bone: "RightLeg",     child: "RightFoot",   dir: "shinR" },
];

interface LimbRig {
  bone: THREE.Object3D;
  name: string;                          // stripped bone name (e.g. "LeftArm")
  restLocal: THREE.Quaternion;           // bone's rest local quaternion
  localAxis: THREE.Vector3;              // direction toward child, in bone-local space
  dir: string;                           // segmentDirs key
  parentBaseWQ: THREE.Quaternion | null; // armature-space rest quat of parent (if parent is NOT an aimed limb)
  parentLimb: string | null;             // parent's stripped name (if parent IS an aimed limb)
}
interface Rig {
  xAxis: THREE.Vector3; yAxis: THREE.Vector3; zAxis: THREE.Vector3;  // character axes, armature space
  limbs: LimbRig[];                                                  // ordered upper-before-lower
  handL: THREE.Object3D | null;
  handR: THREE.Object3D | null;
}

const strip = (o: THREE.Object3D) => o.name.replace(/^mixamorig:?/i, "");

function GlbHumanPosed({
  frames, playing, speed, handL, handR,
}: {
  frames: Pose[]; playing: boolean; speed: number;
  handL: React.RefObject<THREE.Object3D | null>;
  handR: React.RefObject<THREE.Object3D | null>;
}) {
  const gltf = useGLTF(HUMAN_URL);
  const outer = useRef<THREE.Group>(null);
  const pivot = useRef<THREE.Group>(null);
  const rig = useRef<Rig | null>(null);
  const t = useRef(0);

  // Fit (scale + body-centre offset) — measured while the scene is untransformed.
  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);
    const scale = GLB_TARGET_H / (size.y || 1);
    return { scale, center };
  }, [gltf]);

  // Build the bone rig once, when world matrices are first valid.  Everything
  // is captured in the armature's own (rest) frame, which is fixed — so the
  // per-frame aiming never touches world matrices and can't go stale.
  const buildRig = (): Rig | null => {
    const byName = new Map<string, THREE.Object3D>();
    gltf.scene.traverse((o) => { const n = strip(o); if (n) byName.set(n, o); });
    const hips = byName.get("Hips");
    const head = byName.get("Head");
    const armaL = byName.get("LeftArm");
    const armaR = byName.get("RightArm");
    if (!hips || !head || !armaL || !armaR) return null;

    const armature = hips.parent ?? gltf.scene;
    armature.updateWorldMatrix(true, true);
    const armInv = armature.getWorldQuaternion(new THREE.Quaternion()).invert();
    const wqArm = (o: THREE.Object3D) => armInv.clone().multiply(o.getWorldQuaternion(new THREE.Quaternion()));
    const posArm = (o: THREE.Object3D) => armature.worldToLocal(o.getWorldPosition(new THREE.Vector3()));

    const xAxis = posArm(armaR).sub(posArm(armaL)).normalize();  // character right
    const yAxis = posArm(head).sub(posArm(hips)).normalize();    // up
    // Anatomical forward (the way the chest faces).  For a camera-facing model
    // the right hand is at world −X, so xAxis×yAxis points backward; use
    // yAxis×xAxis so +Z of a pose (e.g. L-sit legs) points where the chest faces.
    const zAxis = yAxis.clone().cross(xAxis).normalize();

    const limbNames = new Set(LIMB_BONES.map((s) => s.bone));
    const limbs: LimbRig[] = [];
    for (const spec of LIMB_BONES) {
      const bone = byName.get(spec.bone);
      const child = byName.get(spec.child);
      if (!bone || !child || !bone.parent) continue;
      const parentName = strip(bone.parent);
      const parentIsLimb = limbNames.has(parentName);
      limbs.push({
        bone,
        name: spec.bone,
        restLocal: bone.quaternion.clone(),
        localAxis: child.position.clone().normalize(),
        dir: spec.dir,
        parentBaseWQ: parentIsLimb ? null : wqArm(bone.parent),
        parentLimb: parentIsLimb ? parentName : null,
      });
    }
    return { xAxis, yAxis, zAxis, limbs, handL: byName.get("LeftHand") ?? null, handR: byName.get("RightHand") ?? null };
  };

  useFrame((_, delta) => {
    if (!rig.current) {
      rig.current = buildRig();
      if (!rig.current) return;
      handL.current = rig.current.handL;
      handR.current = rig.current.handR;
    }
    const r = rig.current;

    if (frames.length > 1 && playing) t.current += delta * 0.5 * speed;
    const s = sampleFrames(frames, t.current);
    const dirs = segmentDirs(s.angle);
    const toArm = (d: THREE.Vector3) =>
      r.xAxis.clone().multiplyScalar(d.x).add(r.yAxis.clone().multiplyScalar(d.y)).add(r.zAxis.clone().multiplyScalar(d.z)).normalize();

    // Aim each limb in armature space.  LIMB_BONES lists upper bones before
    // their children, and we record each bone's resulting armature-space quat
    // (`wpost`) so a forearm/shin composes onto its just-aimed parent.
    const wpost: Record<string, THREE.Quaternion> = {};
    for (const l of r.limbs) {
      const desired = dirs[l.dir];
      const parentWQ = l.parentBaseWQ ?? wpost[l.parentLimb ?? ""];
      if (!desired || !parentWQ) continue;
      const Wpre = parentWQ.clone().multiply(l.restLocal);        // bone quat if at rest local
      const axis = l.localAxis.clone().applyQuaternion(Wpre).normalize();
      const qA = new THREE.Quaternion().setFromUnitVectors(axis, toArm(desired));
      const Wp = qA.multiply(Wpre);                               // aimed armature-space quat
      l.bone.quaternion.copy(parentWQ.clone().invert().multiply(Wp));
      wpost[l.name] = Wp;
    }

    // Whole-body orientation + offset (root) on the pivot / outer groups.
    if (pivot.current) pivot.current.rotation.set(d2r(s.rr[0]), d2r(s.rr[1]), d2r(s.rr[2]));
    if (outer.current) outer.current.position.set(s.rp[0], PIVOT_Y + s.rp[1], s.rp[2]);
  });

  return (
    <group ref={outer} position={[0, PIVOT_Y, 0]} scale={fit.scale}>
      <group ref={pivot}>
        <primitive object={gltf.scene} position={[-fit.center.x, -fit.center.y, -fit.center.z]} />
      </group>
    </group>
  );
}

class GlbBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() { return { err: true }; }
  render() { return this.state.err ? this.props.fallback : this.props.children; }
}

type Props = { frames: Pose[]; animated: boolean };

export default function SkillPose3D({ frames, animated }: Props) {
  const handL = useRef<THREE.Object3D | null>(null);
  const handR = useRef<THREE.Object3D | null>(null);
  return (
    <div className="w-full">
      <div className="w-full h-[420px] rounded-lg overflow-hidden bg-gradient-to-b from-[#14141c] to-[#08080c] border border-[#1e1e1e]">
        <Canvas camera={{ position: [1.7, 0.5, 5.4], fov: 30 }}>
          <ambientLight intensity={0.75} />
          <directionalLight position={[3, 5, 2]} intensity={1.15} />
          <directionalLight position={[-3, 2, -2]} intensity={0.4} />
          <Ground />
          {/* Realistic Mixamo human, posed per skill. Falls back to the
              articulated primitive figure if the model can't load. */}
          <GlbBoundary fallback={<PrimitiveFigure frames={frames} playing={animated} speed={1} />}>
            <Suspense fallback={<PrimitiveFigure frames={frames} playing={animated} speed={1} />}>
              <GlbHumanPosed frames={frames} playing={animated} speed={1} handL={handL} handR={handR} />
              <RingRig wristL={handL} wristR={handR} />
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
