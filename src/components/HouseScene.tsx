// Scene 3D — SRS §5.2 UI-01/02/06/11, FR-01/02/06/23.
// Dollhouse prosedural (tanpa atap) denah 10 m × 12 m / 120 m², ~90 m² bangunan,
// sesuai gambar denah: depan/selatan = +Z (Teras + taman depan + Carport timur),
// belakang/utara = −Z (Taman Belakang + Ruang Jemuran). X = timur–barat.
// Dinding ~2,4 m. Furnitur prosedural ringan (box/cylinder) demi target 60 FPS
// (NFR-01, DPR maks 2). Pengaturan visual bersifat LOKAL — tidak pernah
// mengubah state perangkat (FR-21, AC-16).
import { Component, Suspense, useRef } from 'react';
import type { ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useSmartHome } from '../store/useStore';
import { toggleLamp } from '../mqtt/commandService';
import { DEVICES } from '../config/devices';

const WALL_H = 2.4;
const WALL_T = 0.15;

function Box(props: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  roughness?: number;
}) {
  return (
    <mesh position={props.position} castShadow receiveShadow>
      <boxGeometry args={props.size} />
      <meshStandardMaterial color={props.color} roughness={props.roughness ?? 0.9} />
    </mesh>
  );
}

/** Segmen dinding horizontal/vertikal (sumbu X atau Z). */
function WallSegment(props: {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  color?: string;
  height?: number;
}) {
  const { x1, z1, x2, z2 } = props;
  const len = Math.hypot(x2 - x1, z2 - z1);
  const cx = (x1 + x2) / 2;
  const cz = (z1 + z2) / 2;
  const alongX = Math.abs(x2 - x1) >= Math.abs(z2 - z1);
  const h = props.height ?? WALL_H;
  return (
    <Box
      position={[cx, h / 2, cz]}
      size={alongX ? [len, h, WALL_T] : [WALL_T, h, len]}
      color={props.color ?? '#ddd6c8'}
    />
  );
}

/** Lantai ruangan + label nama (drei Html, pointer-events none). */
function RoomFloor(props: {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  color: string;
  label?: string;
  labelPos?: [number, number];
}) {
  const w = props.x1 - props.x0;
  const d = props.z1 - props.z0;
  const cx = (props.x0 + props.x1) / 2;
  const cz = (props.z0 + props.z1) / 2;
  const [lx, lz] = props.labelPos ?? [cx, cz];
  return (
    <group>
      <mesh position={[cx, 0.01, cz]} receiveShadow>
        <boxGeometry args={[w, 0.02, d]} />
        <meshStandardMaterial color={props.color} roughness={0.95} />
      </mesh>
      {props.label && (
        <Html
          position={[lx, 0.05, lz]}
          center
          zIndexRange={[10, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div
            style={{
              background: 'rgba(255,255,255,0.92)',
              border: '1px solid #d8d2c4',
              borderRadius: 6,
              padding: '2px 8px',
              fontSize: 11,
              fontWeight: 600,
              color: '#3f3a33',
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
            }}
          >
            {props.label}
          </div>
        </Html>
      )}
    </group>
  );
}

// ---- Furnitur prosedural ----
function Bed(props: { position: [number, number, number]; rotateY?: number; color?: string }) {
  return (
    <group position={props.position} rotation={[0, props.rotateY ?? 0, 0]}>
      <Box position={[0, 0.25, 0]} size={[1.6, 0.35, 2.1]} color={props.color ?? '#8a94a6'} />
      <Box position={[0, 0.5, -0.85]} size={[1.6, 0.35, 0.3]} color="#f2efe8" />
      <Box position={[0, 0.62, 0.85]} size={[1.6, 0.55, 0.12]} color="#6b5d4f" />
    </group>
  );
}

function Sofa(props: { position: [number, number, number]; rotateY?: number; color?: string }) {
  const c = props.color ?? '#7d8a99';
  return (
    <group position={props.position} rotation={[0, props.rotateY ?? 0, 0]}>
      <Box position={[0, 0.3, 0]} size={[2.0, 0.4, 0.85]} color={c} />
      <Box position={[0, 0.65, -0.32]} size={[2.0, 0.55, 0.25]} color={c} />
      <Box position={[-0.9, 0.55, 0]} size={[0.2, 0.35, 0.85]} color={c} />
      <Box position={[0.9, 0.55, 0]} size={[0.2, 0.35, 0.85]} color={c} />
    </group>
  );
}

function Table(props: { position: [number, number, number]; size?: [number, number] }) {
  const [w, d] = props.size ?? [1.2, 0.7];
  return (
    <group position={props.position}>
      <Box position={[0, 0.72, 0]} size={[w, 0.06, d]} color="#a9805a" />
      <Box position={[-w / 2 + 0.08, 0.36, -d / 2 + 0.08]} size={[0.08, 0.72, 0.08]} color="#7a5c40" />
      <Box position={[w / 2 - 0.08, 0.36, -d / 2 + 0.08]} size={[0.08, 0.72, 0.08]} color="#7a5c40" />
      <Box position={[-w / 2 + 0.08, 0.36, d / 2 - 0.08]} size={[0.08, 0.72, 0.08]} color="#7a5c40" />
      <Box position={[w / 2 - 0.08, 0.36, d / 2 - 0.08]} size={[0.08, 0.72, 0.08]} color="#7a5c40" />
    </group>
  );
}

function Toilet(props: { position: [number, number, number]; rotateY?: number }) {
  return (
    <group position={props.position} rotation={[0, props.rotateY ?? 0, 0]}>
      <Box position={[0, 0.55, -0.25]} size={[0.45, 0.7, 0.15]} color="#f5f5f2" />
      <mesh position={[0, 0.32, 0.05]} castShadow>
        <cylinderGeometry args={[0.22, 0.18, 0.4, 16]} />
        <meshStandardMaterial color="#f5f5f2" roughness={0.4} />
      </mesh>
    </group>
  );
}

function Tree(props: { position: [number, number, number]; scale?: number }) {
  const s = props.scale ?? 1;
  return (
    <group position={props.position} scale={s}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.12, 1, 8]} />
        <meshStandardMaterial color="#7a5c40" />
      </mesh>
      <mesh position={[0, 1.5, 0]} castShadow>
        <sphereGeometry args={[0.75, 12, 10]} />
        <meshStandardMaterial color="#4e8a4a" roughness={1} />
      </mesh>
    </group>
  );
}

function Car(props: { position: [number, number, number] }) {
  return (
    <group position={props.position}>
      <Box position={[0, 0.45, 0]} size={[1.8, 0.55, 4.2]} color="#e8e8e8" />
      <Box position={[0, 0.95, -0.2]} size={[1.6, 0.5, 2.2]} color="#d5dbe0" />
      <Box position={[0, 1.0, 0.95]} size={[1.5, 0.35, 0.3]} color="#2c3e50" />
      {(
        [
          [-0.85, 0.32, 1.4],
          [0.85, 0.32, 1.4],
          [-0.85, 0.32, -1.4],
          [0.85, 0.32, -1.4],
        ] as [number, number, number][]
      ).map((p, i) => (
        <mesh key={i} position={p} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.32, 0.32, 0.22, 16]} />
          <meshStandardMaterial color="#222222" roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

// ---- Lampu gantung (aktuator) ----
const LAMP_POS: Record<string, [number, number, number]> = {
  ruang_tamu: [1.25, 0, 1.75],
  ruang_keluarga: [-0.25, 0, -2.75],
  kamar_utama: [-3.25, 0, -2.75],
  dapur: [1.75, 0, -2.5],
};

function Lamp(props: { roomId: string; deviceId: string }) {
  const dev = useSmartHome((s) => s.devices[props.deviceId]);
  const mode = useSmartHome((s) => s.mode);
  const brokerStatus = useSmartHome((s) => s.brokerStatus);
  const selected = useSmartHome((s) => s.selectedDeviceId === props.deviceId);
  const hovered = useSmartHome((s) => s.hoveredDeviceId === props.deviceId);
  const setHovered = useSmartHome((s) => s.setHoveredDeviceId);
  const setSelected = useSmartHome((s) => s.setSelectedDeviceId);
  const bulbRef = useRef<THREE.MeshStandardMaterial>(null);
  const [x, , z] = LAMP_POS[props.roomId] ?? [0, 0, 0];

  const available = dev.availability === 'ONLINE';
  const canControl =
    mode === 'SIMULATION' || (brokerStatus === 'CONNECTED' && available);
  const pending = dev.pending !== null;
  const on = dev.confirmedState === 'ON';

  useFrame(({ clock }) => {
    const m = bulbRef.current;
    if (!m) return;
    if (pending) {
      // PENDING: denyut amber — jelas berbeda dari ON/OFF terkonfirmasi.
      m.emissiveIntensity = 1.2 + Math.sin(clock.elapsedTime * 6) * 0.9;
    } else if (on) {
      m.emissiveIntensity = 2.2;
    } else {
      m.emissiveIntensity = 0.05;
    }
  });

  const bulbColor = pending ? '#f5a623' : on ? '#ffd97a' : '#9a9a9a';
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (!canControl) return;
    setSelected(props.deviceId);
    const res = toggleLamp(props.deviceId);
    if (!res.ok) {
      useSmartHome.getState().addEvent('info', `Lampu ${dev.config.roomName}: ${res.reason}`);
    }
  };

  return (
    <group
      position={[x, 0, z]}
      onClick={handleClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(props.deviceId);
        document.body.style.cursor = canControl ? 'pointer' : 'not-allowed';
      }}
      onPointerOut={() => {
        setHovered(null);
        document.body.style.cursor = 'auto';
      }}
    >
      {/* kabel gantung */}
      <mesh position={[0, 2.25, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.3, 8]} />
        <meshStandardMaterial color="#333333" />
      </mesh>
      {/* kap lampu */}
      <mesh position={[0, 2.02, 0]} castShadow>
        <coneGeometry args={[0.22, 0.22, 20, 1, true]} />
        <meshStandardMaterial
          color={selected || hovered ? '#c9a227' : '#3a3a3a'}
          emissive={selected || hovered ? '#c9a227' : '#000000'}
          emissiveIntensity={selected || hovered ? 0.5 : 0}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* bohlam */}
      <mesh position={[0, 1.92, 0]}>
        <sphereGeometry args={[0.09, 16, 12]} />
        <meshStandardMaterial
          ref={bulbRef}
          color={bulbColor}
          emissive={bulbColor}
          emissiveIntensity={on ? 2.2 : 0.05}
        />
      </mesh>
      {on && !pending && (
        <pointLight position={[0, 1.85, 0]} intensity={14} distance={7} decay={2} color="#ffd9a0" />
      )}
      {pending && (
        <pointLight position={[0, 1.85, 0]} intensity={6} distance={5} decay={2} color="#f5a623" />
      )}
      {(selected || hovered) && (
        <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.45, 0.55, 32]} />
          <meshBasicMaterial color="#c9a227" side={THREE.DoubleSide} />
        </mesh>
      )}
      {!available && mode === 'LIVE' && (
        <Html position={[0, 1.6, 0]} center style={{ pointerEvents: 'none' }}>
          <div
            style={{
              background: 'rgba(60,60,60,0.9)',
              color: '#fff',
              fontSize: 10,
              padding: '2px 6px',
              borderRadius: 4,
              whiteSpace: 'nowrap',
            }}
          >
            tidak tersedia
          </div>
        </Html>
      )}
    </group>
  );
}

class SceneErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }
  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, color: '#8a2f2f' }}>
          Scene 3D gagal dimuat — periksa dukungan WebGL pada browser Anda.
        </div>
      );
    }
    return this.props.children;
  }
}

export default function HouseScene(props: { onReady: () => void }) {
  const autoRotate = useSmartHome((s) => s.scene.autoRotate);
  const shadows = useSmartHome((s) => s.scene.shadows);
  const quality = useSmartHome((s) => s.scene.quality);

  return (
    <SceneErrorBoundary>
      <Canvas
        dpr={[1, 2]}
        shadows={shadows}
        camera={{ position: [10.5, 11, 13.5], fov: 45 }}
        onCreated={() => props.onReady()}
        style={{ background: '#eef1f4' }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.75} />
          <directionalLight
            position={[9, 14, 7]}
            intensity={1.6}
            castShadow={shadows}
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-9}
            shadow-camera-right={9}
            shadow-camera-top={9}
            shadow-camera-bottom={-9}
          />
          <OrbitControls
            makeDefault
            autoRotate={autoRotate}
            autoRotateSpeed={0.8}
            maxPolarAngle={Math.PI / 2.15}
            minDistance={5}
            maxDistance={30}
            target={[0, 0, 0.5]}
          />

          {/* Alas lahan 10 × 12 m */}
          <Box position={[0, -0.12, 0]} size={[10.4, 0.24, 12.4]} color="#b9b3a6" />

          {/* Taman belakang (utara) + Ruang Jemuran (timur laut) */}
          <RoomFloor x0={-5} z0={-6} x1={1.5} z1={-4.5} color="#6faf5e" label="Taman Belakang" />
          <RoomFloor x0={1.5} z0={-6} x1={5} z1={-4.5} color="#c9c9c4" label="Ruang Jemuran" labelPos={[3.25, -5.25]} />
          {/* Jemuran pakaian */}
          <Box position={[3.2, 1.0, -5.2]} size={[2.2, 0.05, 0.05]} color="#555555" />
          <Box position={[2.1, 0.55, -5.2]} size={[0.05, 1.1, 0.05]} color="#555555" />
          <Box position={[4.3, 0.55, -5.2]} size={[0.05, 1.1, 0.05]} color="#555555" />
          {['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6'].map((c, i) => (
            <Box key={c} position={[2.5 + i * 0.35, 0.82, -5.2]} size={[0.22, 0.35, 0.02]} color={c} />
          ))}
          <Tree position={[-4.2, 0, -5.3]} scale={1.1} />
          <Tree position={[-1.2, 0, -5.4]} scale={0.8} />

          {/* Lantai ruangan */}
          <RoomFloor x0={-5} z0={-4.5} x1={-1.5} z1={-1.5} color="#efe6d4" label="Kamar Utama" labelPos={[-3.1, -2.2]} />
          <RoomFloor x0={-5} z0={-4.5} x1={-3.6} z1={-3.2} color="#dfe8ea" label="K. Mandi Dalam" labelPos={[-4.3, -3.85]} />
          <RoomFloor x0={-1.5} z0={-4.5} x1={1} z1={-1} color="#f3ede0" label="Ruang Keluarga" />
          <RoomFloor x0={1} z0={-4.5} x1={2.5} z1={-0.5} color="#e8e2d2" label="Dapur" />
          <RoomFloor x0={-5} z0={-1.5} x1={-3.6} z1={0} color="#dfe8ea" label="K. Mandi Luar" labelPos={[-4.3, -0.75]} />
          <RoomFloor x0={-5} z0={0} x1={-2.5} z1={3.5} color="#efe6d4" label="Kamar Tidur 2" />
          <RoomFloor x0={-2.5} z0={0} x1={0} z1={3.5} color="#efe6d4" label="Kamar Tidur 3" />
          <RoomFloor x0={0} z0={0} x1={2.5} z1={3.5} color="#f3ede0" label="Ruang Tamu" />
          <RoomFloor x0={-0.5} z0={3.5} x1={2.5} z1={5} color="#d9d2c2" label="Teras" />
          <RoomFloor x0={-5} z0={3.5} x1={-0.5} z1={6} color="#6faf5e" label="Taman Depan" labelPos={[-2.75, 4.9]} />
          <RoomFloor x0={2.5} z0={-0.5} x1={5} z1={5.5} color="#b5b5ae" label="Carport" labelPos={[3.75, 4.6]} />

          {/* Taman depan: stepping stones + tanaman */}
          {[
            [-2.2, 4.3], [-1.7, 4.3], [-2.2, 4.9], [-1.7, 4.9], [-2.2, 5.5], [-1.7, 5.5],
          ].map(([sx, sz], i) => (
            <Box key={i} position={[sx, 0.03, sz]} size={[0.42, 0.04, 0.42]} color="#cfc8b8" />
          ))}
          <Tree position={[-4.4, 0, 4.2]} scale={1.2} />
          <Tree position={[-4.3, 0, 5.5]} scale={0.7} />

          {/* Dinding luar (dengan celah pintu/jendela) */}
          <WallSegment x1={-5} z1={-4.5} x2={-5} z2={3.5} color="#cfc8b8" />
          <WallSegment x1={-5} z1={-4.5} x2={2.5} z2={-4.5} color="#cfc8b8" />
          <WallSegment x1={2.5} z1={-4.5} x2={2.5} z2={-0.5} color="#cfc8b8" />
          <WallSegment x1={2.5} z1={-0.5} x2={2.5} z2={3.5} color="#cfc8b8" />
          <WallSegment x1={-5} z1={3.5} x2={-0.5} z2={3.5} />
          <WallSegment x1={1.6} z1={3.5} x2={2.5} z2={3.5} />
          {/* Dinding dalam */}
          <WallSegment x1={-1.5} z1={-4.5} x2={-1.5} z2={-2.7} />
          <WallSegment x1={-1.5} z1={-1.9} x2={-1.5} z2={-1.5} />
          <WallSegment x1={1} z1={-4.5} x2={1} z2={-3.4} />
          <WallSegment x1={1} z1={-2.6} x2={1} z2={-1} />
          <WallSegment x1={-3.6} z1={-4.5} x2={-3.6} z2={-3.2} />
          <WallSegment x1={-5} z1={-3.2} x2={-3.6} z2={-3.2} />
          <WallSegment x1={-3.6} z1={-1.5} x2={-3.6} z2={0} />
          <WallSegment x1={-5} z1={-1.5} x2={-3.6} z2={-1.5} />
          <WallSegment x1={-5} z1={0} x2={-3.6} z2={0} />
          <WallSegment x1={-5} z1={-1.5} x2={-1.5} z2={-1.5} />
          <WallSegment x1={-1.5} z1={-1.5} x2={-1.5} z2={-1} />
          <WallSegment x1={-1.5} z1={-1} x2={1} z2={-1} />
          <WallSegment x1={1} z1={-0.5} x2={2.5} z2={-0.5} />
          <WallSegment x1={-2.5} z1={0} x2={-2.5} z2={1.6} />
          <WallSegment x1={-2.5} z1={2.4} x2={-2.5} z2={3.5} />
          <WallSegment x1={0} z1={0} x2={0} z2={1.6} />
          <WallSegment x1={0} z1={2.4} x2={0} z2={3.5} />
          <WallSegment x1={-5} z1={0} x2={-2.5} z2={0} />
          <WallSegment x1={0} z1={0} x2={2.5} z2={0} />

          {/* Furnitur Kamar Utama */}
          <Bed position={[-3.2, 0, -2.3]} rotateY={Math.PI} />
          <Box position={[-1.85, 0.55, -4.1]} size={[0.5, 1.1, 1.4]} color="#8a6f4d" />
          <Box position={[-4.6, 0.4, -2.2]} size={[0.4, 0.8, 0.9]} color="#a9805a" />
          {/* Kamar Mandi Dalam */}
          <Toilet position={[-4.5, 0, -3.5]} />
          <Box position={[-3.85, 0.35, -4.25]} size={[0.5, 0.7, 0.45]} color="#f5f5f2" />
          {/* Ruang Keluarga */}
          <Sofa position={[-0.9, 0, -3.9]} rotateY={0} />
          <Sofa position={[-0.9, 0, -2.2]} rotateY={Math.PI} color="#8a94a6" />
          <Table position={[-0.25, 0, -3.0]} size={[0.9, 0.55]} />
          <Box position={[0.75, 0.6, -3.6]} size={[0.12, 1.2, 1.1]} color="#222222" />
          {/* Dapur */}
          <Box position={[2.2, 0.45, -4.1]} size={[0.5, 0.9, 2.4]} color="#cfd4d6" />
          <Box position={[1.3, 0.45, -4.2]} size={[0.9, 0.9, 0.5]} color="#cfd4d6" />
          <Table position={[1.75, 0, -1.4]} size={[1.1, 0.8]} />
          <Box position={[1.3, 0.45, -1.4]} size={[0.45, 0.9, 0.45]} color="#8a6f4d" />
          <Box position={[2.2, 0.45, -1.4]} size={[0.45, 0.9, 0.45]} color="#8a6f4d" />
          {/* Kamar Mandi Luar */}
          <Toilet position={[-4.5, 0, -0.3]} rotateY={Math.PI / 2} />
          {/* Kamar Tidur 2 */}
          <Bed position={[-4.1, 0, 2.4]} rotateY={Math.PI / 2} />
          <Box position={[-2.85, 0.5, 1.2]} size={[0.45, 1.0, 1.0]} color="#8a6f4d" />
          <Box position={[-2.85, 0.4, 2.9]} size={[0.5, 0.8, 0.5]} color="#a9805a" />
          {/* Kamar Tidur 3 */}
          <Bed position={[-1.25, 0, 2.4]} rotateY={-Math.PI / 2} />
          <Box position={[-2.2, 0.4, 0.5]} size={[0.5, 0.8, 0.9]} color="#a9805a" />
          {/* Ruang Tamu */}
          <Sofa position={[0.45, 0, 2.2]} rotateY={Math.PI / 2} />
          <Sofa position={[1.25, 0, 0.6]} rotateY={Math.PI} color="#8a94a6" />
          <Table position={[1.3, 0, 1.9]} size={[0.9, 0.55]} />
          <Box position={[2.3, 0.6, 1.8]} size={[0.12, 1.2, 1.1]} color="#222222" />
          {/* Teras: pot tanaman */}
          <mesh position={[-0.2, 0.25, 4.6]} castShadow>
            <cylinderGeometry args={[0.18, 0.14, 0.4, 12]} />
            <meshStandardMaterial color="#b06a3b" />
          </mesh>
          <mesh position={[2.2, 0.25, 4.6]} castShadow>
            <cylinderGeometry args={[0.18, 0.14, 0.4, 12]} />
            <meshStandardMaterial color="#b06a3b" />
          </mesh>

          {/* Carport + mobil */}
          <Car position={[3.75, 0, 2.2]} />
          <Tree position={[4.5, 0, 5.2]} scale={0.7} />

          {/* Lampu gantung — 4 aktuator */}
          {DEVICES.map((d) => (
            <Lamp key={d.deviceId} roomId={d.roomId} deviceId={d.deviceId} />
          ))}

          {quality === 'low' && <fog attach="fog" args={['#eef1f4', 25, 45]} />}
        </Suspense>
      </Canvas>
    </SceneErrorBoundary>
  );
}
