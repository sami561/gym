import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Meliora's signature ceiling: a honeycomb of white LED tubes framed by a rectangle
 * (see assets/images/interior.jpg), seen from below. Tubes switch on like fluorescent
 * lights in a wave from the front, then the camera drifts with the pointer.
 */

const CEILING_Y = 2.4;
const HEX_SIZE = 1.15;
const GAP = 0.86; // tubes stop short of the corners, like the connectors of real LED kits
const X_HALF = 13;
const Z_NEAR = 1.5;
const Z_FAR = -34;

interface Edge {
  x: number;
  z: number;
  angle: number;
  length: number;
  delay: number;
}

function buildCeiling(): Edge[] {
  const edges = new Map<string, Edge>();
  const w = Math.sqrt(3) * HEX_SIZE;
  const rows = Math.ceil((Z_NEAR - Z_FAR) / (1.5 * HEX_SIZE)) + 2;
  const cols = Math.ceil((2 * X_HALF) / w) + 2;

  for (let r = -1; r < rows; r++) {
    for (let c = -cols / 2; c < cols / 2; c++) {
      const cx = c * w + (r % 2 ? w / 2 : 0);
      const cz = Z_NEAR - r * 1.5 * HEX_SIZE;
      if (Math.abs(cx) > X_HALF - w / 2 || cz < Z_FAR + HEX_SIZE || cz > Z_NEAR - HEX_SIZE * 0.2) continue;
      for (let i = 0; i < 6; i++) {
        const a1 = (Math.PI / 3) * i + Math.PI / 6;
        const a2 = (Math.PI / 3) * (i + 1) + Math.PI / 6;
        const x1 = cx + HEX_SIZE * Math.cos(a1);
        const z1 = cz + HEX_SIZE * Math.sin(a1);
        const x2 = cx + HEX_SIZE * Math.cos(a2);
        const z2 = cz + HEX_SIZE * Math.sin(a2);
        const mx = (x1 + x2) / 2;
        const mz = (z1 + z2) / 2;
        const key = `${mx.toFixed(2)}:${mz.toFixed(2)}`;
        if (edges.has(key)) continue;
        const distance = Math.hypot(mx, (mz - Z_NEAR) * 0.55);
        edges.set(key, {
          x: mx,
          z: mz,
          angle: Math.atan2(-(z2 - z1), x2 - x1),
          length: HEX_SIZE * GAP,
          delay: 0.25 + distance * 0.075 + Math.random() * 0.3,
        });
      }
    }
  }

  // Rectangular frame around the honeycomb.
  const frameDelay = 0.15;
  const fx = X_HALF + 0.25;
  const fz0 = Z_NEAR + 0.25;
  const fz1 = Z_FAR + 0.6;
  const frame: Edge[] = [
    { x: 0, z: fz0, angle: 0, length: fx * 2, delay: frameDelay },
    { x: 0, z: fz1, angle: 0, length: fx * 2, delay: frameDelay + 0.6 },
    { x: -fx, z: (fz0 + fz1) / 2, angle: Math.PI / 2, length: fz0 - fz1, delay: frameDelay + 0.2 },
    { x: fx, z: (fz0 + fz1) / 2, angle: Math.PI / 2, length: fz0 - fz1, delay: frameDelay + 0.2 },
  ];
  return [...edges.values(), ...frame];
}

const vertexShader = /* glsl */ `
  attribute float aDelay;
  varying float vDelay;
  varying vec2 vUv;
  varying float vDepth;
  void main() {
    vUv = uv;
    vDelay = aDelay;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const lightFn = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  varying float vDelay;
  varying vec2 vUv;
  varying float vDepth;
  float hash(float n) { return fract(sin(n) * 43758.5453123); }
  // Fluorescent start: a few irregular flickers, then steady light.
  float lit(float t, float seed) {
    if (t < 0.0) return 0.0;
    if (t > 0.7) return 1.0;
    float flick = step(0.42, hash(floor(t * 26.0) + seed * 31.0));
    return mix(flick * 0.85, 1.0, smoothstep(0.5, 0.7, t));
  }
  // Far tubes fade into the dark; the closest ones are dimmed so they never glare over the copy.
  float depthFade() { return mix(0.22, 1.0, smoothstep(34.0, 5.0, vDepth)) * mix(0.4, 1.0, smoothstep(2.0, 5.5, vDepth)); }
`;

const coreFragment = /* glsl */ `
  ${lightFn}
  void main() {
    float i = lit(uTime - vDelay, vDelay) * depthFade();
    gl_FragColor = vec4(uColor * i * 1.15, 1.0);
  }
`;

const glowFragment = /* glsl */ `
  ${lightFn}
  uniform float uStrength;
  void main() {
    float across = abs(vUv.y - 0.5) * 2.0;
    float along = abs(vUv.x - 0.5) * 2.0;
    float falloff = pow(1.0 - across, 2.6) * (1.0 - pow(along, 8.0));
    float i = lit(uTime - vDelay, vDelay) * depthFade();
    gl_FragColor = vec4(uColor * falloff * i * uStrength, 1.0);
  }
`;

function Tubes({ edges, width, fragment, strength }: { edges: Edge[]; width: number; fragment: string; strength?: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.setAttribute('aDelay', new THREE.InstancedBufferAttribute(new Float32Array(edges.map((e) => e.delay)), 1));
    return g;
  }, [edges]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader: fragment,
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new THREE.Color('#e9f2ff') },
          uStrength: { value: strength ?? 1 },
        },
        side: THREE.DoubleSide,
        transparent: strength !== undefined,
        depthWrite: strength === undefined,
        blending: strength !== undefined ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    [fragment, strength],
  );

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const matrix = new THREE.Matrix4();
    const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    const turn = new THREE.Quaternion();
    const q = new THREE.Quaternion();
    edges.forEach((edge, i) => {
      turn.setFromAxisAngle(new THREE.Vector3(0, 1, 0), edge.angle);
      q.copy(turn).multiply(tilt);
      matrix.compose(new THREE.Vector3(edge.x, CEILING_Y, edge.z), q, new THREE.Vector3(edge.length, width, 1));
      m.setMatrixAt(i, matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [edges, width]);

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
  });

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  return <instancedMesh ref={mesh} args={[geometry, material, edges.length]} frustumCulled={false} />;
}

/** Camera below the ceiling, looking up the room; eases toward the pointer. */
function CameraRig({ pointer }: { pointer: RefObject<{ x: number; y: number }> }) {
  const { camera } = useThree();
  const look = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, delta) => {
    const p = pointer.current ?? { x: 0, y: 0 };
    const ease = 1 - Math.exp(-delta * 2.2);
    camera.position.x += (p.x * 0.9 - camera.position.x) * ease;
    camera.position.y += (-p.y * 0.35 - camera.position.y) * ease;
    look.set(camera.position.x * 0.4, CEILING_Y + 0.9, -9);
    camera.lookAt(look);
  });
  return null;
}

export default function HexCeiling({ active }: { active: boolean }) {
  const edges = useMemo(buildCeiling, []);
  const pointer = useRef({ x: 0, y: 0 });
  const [dpr, setDpr] = useState(1.5);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current = { x: (e.clientX / window.innerWidth) * 2 - 1, y: (e.clientY / window.innerHeight) * 2 - 1 };
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  return (
    <Canvas
      dpr={[1, dpr]}
      frameloop={active ? 'always' : 'never'}
      camera={{ position: [0, 0, 2.5], fov: 62, near: 0.1, far: 80 }}
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
      onCreated={({ gl }) => gl.setClearColor('#000000')}
      aria-hidden
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.5)} />
      <CameraRig pointer={pointer} />
      <Tubes edges={edges} width={0.045} fragment={coreFragment} />
      <Tubes edges={edges} width={0.55} fragment={glowFragment} strength={0.32} />
    </Canvas>
  );
}
