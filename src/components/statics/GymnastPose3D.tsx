import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { PositionKey } from "@/lib/staticsRenders";

// ─────────────────────────────────────────────────────────────────────────
// Orbitable 3D view of a statics position.
//
// The gymnast ships as ONE rigged .glb with one animation clip per position
// (scripts/statics-render/export_gltf.py). Posing is done by seeking a clip to
// t=0 rather than by writing bone quaternions from a table: Blender stores a
// pose bone's rotation relative to its rest matrix in the bone's own space,
// glTF stores a node transform in a Y-up scene, and converting between those
// by hand is exactly the sort of thing that comes out silently mirrored. It
// also means an animated transition later is the same mechanism with two
// keyframes instead of one.
//
// The rings are not in the .glb — they move per position — so their transforms
// come from rings3d.json, already converted to glTF's Y-up axes.
// ─────────────────────────────────────────────────────────────────────────

const GLB_URL = "/models/gymnast.glb";
const RINGS_URL = "/statics/rings3d.json";

type Vec3 = [number, number, number];
type RingsFile = {
  ringRadius: number;
  tubeRadius: number;
  poses: Record<string, {
    rings: { pos: Vec3; normal: Vec3 }[];
    straps: { pos: Vec3; dir: Vec3; len: number }[];
    support: boolean;
  }>;
};

const ZAXIS = new THREE.Vector3(0, 0, 1);
const YAXIS = new THREE.Vector3(0, 1, 0);

/** Direction to put the camera in so the pose reads most openly.
 *
 *  A fixed camera angle is wrong for half these elements. An L-sit's legs point
 *  straight at a front camera and collapse into stubs; a maltese's arms spread
 *  along the axis a side camera looks down. Score each candidate by how much the
 *  skeleton SPREADS in the image plane — the geometric mean of the two principal
 *  spreads, which is large only when the figure is open in both screen axes and
 *  falls to zero when a limb points at the lens. */
function bestView(pts: THREE.Vector3[]): THREE.Vector3 {
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  let best = new THREE.Vector3(0.36, 0.22, 0.9).normalize();
  let score = -1;
  for (let a = 0; a < 360; a += 15) {
    for (const e of [-6, 8, 22, 36]) {
      const ar = (a * Math.PI) / 180, er = (e * Math.PI) / 180;
      const d = new THREE.Vector3(
        Math.sin(ar) * Math.cos(er), Math.sin(er), Math.cos(ar) * Math.cos(er));
      right.crossVectors(YAXIS, d);
      if (right.lengthSq() < 1e-9) continue;
      right.normalize();
      up.crossVectors(d, right).normalize();
      let mx = 0, my = 0;
      for (const p of pts) { mx += p.dot(right); my += p.dot(up); }
      mx /= pts.length; my /= pts.length;
      let sxx = 0, syy = 0, sxy = 0;
      for (const p of pts) {
        const x = p.dot(right) - mx, y = p.dot(up) - my;
        sxx += x * x; syy += y * y; sxy += x * y;
      }
      sxx /= pts.length; syy /= pts.length; sxy /= pts.length;
      const tr = sxx + syy;
      const disc = Math.max(0, (tr * tr) / 4 - (sxx * syy - sxy * sxy));
      const l1 = tr / 2 + Math.sqrt(disc), l2 = tr / 2 - Math.sqrt(disc);
      // mild preference for a level camera near the default front
      const s = Math.sqrt(Math.max(l1, 0) * Math.max(l2, 0))
        * (1 - 0.0015 * Math.abs(e)) * (1 + 0.02 * Math.cos(ar));
      if (s > score) { score = s; best = d.clone(); }
    }
  }
  return best;
}
/** Rotation taking `from` onto an exported direction. Directions convert
 *  between Blender's Z-up and glTF's Y-up exactly like positions do, so
 *  rebuilding the rotation here is safe where converting a quaternion by hand
 *  was not — that was what left the rings at the wrong angle. */
function aimQuat(dir: Vec3, from: THREE.Vector3) {
  return new THREE.Quaternion().setFromUnitVectors(
    from, new THREE.Vector3(dir[0], dir[1], dir[2]).normalize());
}

let ringsPromise: Promise<RingsFile> | null = null;
function useRings(): RingsFile | null {
  const [data, setData] = useState<RingsFile | null>(null);
  useEffect(() => {
    ringsPromise ??= fetch(RINGS_URL).then(r => r.json());
    let alive = true;
    ringsPromise.then(d => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  return data;
}

function Figure({ poseKey, extra, onBounds }: {
  poseKey: PositionKey;
  extra: Vec3[];
  onBounds: (c: THREE.Vector3, r: number, dir: THREE.Vector3) => void;
}) {
  const gltf = useGLTF(GLB_URL);
  // SkeletonUtils.clone, not Object3D.clone: a plain clone shares the Skeleton,
  // so two viewers on screen would pose each other's figure
  const scene = useMemo(() => cloneSkinned(gltf.scene), [gltf.scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(scene), [scene]);

  useEffect(() => {
    const clip = gltf.animations.find(c => c.name === poseKey)
      ?? gltf.animations.find(c => c.name.endsWith(poseKey));
    mixer.stopAllAction();
    if (!clip) return;
    mixer.clipAction(clip).reset().play();
    // each clip is a held pose, so seek once instead of ticking every frame
    mixer.setTime(0);
    mixer.update(0);
    scene.updateMatrixWorld(true);

    // Frame from the BONES, not Box3.setFromObject: for a skinned mesh that
    // uses the bind-pose geometry bounds, which are identical for every clip —
    // so the camera framed a handstand exactly like an iron cross.
    const box = new THREE.Box3();
    const p = new THREE.Vector3();
    scene.traverse(o => {
      if ((o as THREE.Bone).isBone) box.expandByPoint(p.setFromMatrixPosition(o.matrixWorld));
    });
    for (const e of extra) box.expandByPoint(p.set(e[0], e[1], e[2]));
    if (box.isEmpty()) return;
    box.expandByScalar(0.10);          // bones are the skeleton; add some flesh
    const bones: THREE.Vector3[] = [];
    scene.traverse(o => {
      if ((o as THREE.Bone).isBone)
        bones.push(new THREE.Vector3().setFromMatrixPosition(o.matrixWorld));
    });
    onBounds(box.getCenter(new THREE.Vector3()),
             box.getSize(new THREE.Vector3()).length() / 2,
             bestView(bones));
  }, [poseKey, gltf.animations, mixer, scene, extra, onBounds]);

  useEffect(() => () => { mixer.stopAllAction(); }, [mixer]);

  return <primitive object={scene} />;
}

function Rings({ poseKey, data }: { poseKey: PositionKey; data: RingsFile }) {
  const entry = data.poses[poseKey];
  if (!entry) return null;
  return (
    <group>
      {entry.rings.map((r, i) => (
        // TorusGeometry's own normal is +Z, so aim +Z at the exported normal
        <mesh key={"r" + i} position={r.pos} quaternion={aimQuat(r.normal, ZAXIS)}>
          <torusGeometry args={[data.ringRadius, data.tubeRadius, 20, 64]} />
          <meshStandardMaterial color="#7a4a1c" roughness={0.42} />
        </mesh>
      ))}
      {entry.straps.map((s, i) => (
        // CylinderGeometry runs along Y, so aim +Y down the strap
        <mesh key={"s" + i} position={s.pos} quaternion={aimQuat(s.dir, YAXIS)}>
          <cylinderGeometry args={[0.0085, 0.0085, s.len, 12]} />
          <meshStandardMaterial color="#9a978f" roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

function Frame({ target, radius, dir }: {
  target: THREE.Vector3; radius: number; dir: THREE.Vector3;
}) {
  const camera = useThree(s => s.camera);
  // OrbitControls (makeDefault) keeps its own spherical state and rewrites
  // camera.position on every update(), so setting the position alone was
  // silently reverted — the chosen view lasted until the first interaction and
  // then snapped back to the default front angle.
  const controls = useThree(s => s.controls) as
    { target: THREE.Vector3; update: () => void } | null;
  const done = useRef("");
  useEffect(() => {
    const key = `${target.toArray().join()}|${radius}|${dir.toArray().join()}`;
    // drei registers the controls AFTER the first effect pass. Bailing out then
    // and marking the work done left OrbitControls to fall back to its own
    // default position, so the computed framing never took.
    if (!controls || done.current === key || radius <= 0) return;
    done.current = key;
    const d = radius / Math.sin((((camera as THREE.PerspectiveCamera).fov ?? 45) * Math.PI) / 360);
    camera.position.copy(target).addScaledVector(dir, d);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.copy(target);
      controls.update();               // adopt the new position as ITS state
    }
  }, [camera, controls, target, radius, dir]);
  return null;
}

export default function GymnastPose3D({ poseKey }: { poseKey: PositionKey }) {
  const rings = useRings();
  const [target, setTarget] = useState(new THREE.Vector3(0, 1, 0));
  const [radius, setRadius] = useState(1.2);
  const [dir, setDir] = useState(() => new THREE.Vector3(0.36, 0.22, 0.9).normalize());
  const onBounds = useMemo(
    () => (c: THREE.Vector3, r: number, d: THREE.Vector3) => {
      setTarget(c); setRadius(r); setDir(d);
    },
    [],
  );
  // the rings sit outside the skeleton, so they have to be in the framing too
  const extra = useMemo<Vec3[]>(
    () => rings?.poses[poseKey]?.rings.map(r => r.pos) ?? [],
    [rings, poseKey],
  );

  return (
    <div className="relative w-full aspect-square bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg overflow-hidden">
      <Canvas
        camera={{ fov: 38, near: 0.05, far: 60 }}
        dpr={[1, 2]}
        shadows={false}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }}
      >
        <color attach="background" args={["#0a0a0a"]} />
        {/* key from high and to one side gives the delts and lats a shadow edge
            to read against; the two rims separate the figure from a dark page,
            which is most of what stops a smooth mesh looking like a mannequin */}
        <hemisphereLight args={["#cfd6ff", "#241d18", 0.5]} />
        <directionalLight position={[2.4, 3.4, 2.2]} intensity={2.6} color="#fff3e6" />
        <directionalLight position={[-3.0, 1.2, -1.6]} intensity={0.55} color="#aabfff" />
        <directionalLight position={[-1.2, 1.6, -3.2]} intensity={1.5} color="#ffe8d2" />
        <directionalLight position={[2.6, 0.4, -2.4]} intensity={1.1} color="#dce6ff" />
        <Suspense fallback={null}>
          <Figure poseKey={poseKey} extra={extra} onBounds={onBounds} />
          {rings && <Rings poseKey={poseKey} data={rings} />}
        </Suspense>
        <Frame target={target} radius={radius} dir={dir} />
        <OrbitControls enablePan enableDamping dampingFactor={0.08}
                       minDistance={0.3} maxDistance={12} makeDefault />
      </Canvas>
      <div className="absolute bottom-2 left-0 right-0 text-center text-[10px] text-[#666] pointer-events-none">
        drag to orbit · scroll to zoom · right-drag to pan
      </div>
    </div>
  );
}

useGLTF.preload(GLB_URL);
