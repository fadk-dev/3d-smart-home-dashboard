// Scene 3D — SRS IIoT Catering v1.1 §3.1, FR-04, AC-13.
// Dollhouse prosedural (tanpa atap) denah 12,0 m × 10,0 m, utara = −Z,
// sesuai gambar denah rumah produksi makanan. Tembok rendah (default 1,2 m,
// bisa diatur 0,6–3,0 m) dan semi-transparan (default opasitas 0,45) agar
// isi ruangan terlihat; semua label marker bisa disembunyikan.
// Koordinat denah: x 0–12 (barat→timur), z 0–10 (utara→selatan);
// konversi ke Three.js: x3 = x − 6, z3 = z − 5.
// Warna lantai ruangan: hijau = semua parameter normal, amber = alert aktif,
// merah (denyut) = kritis/offline, abu-abu = non-MVP (di luar MVP).
// Klik lantai ruangan atau beacon sensor untuk memilih ruangan.
import { Component, Suspense, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { computeRoomStatus, effectiveDeviceStatus, useIiotStore } from '../store/useStore';
import type { RoomStatus } from '../store/useStore';
import { humidityColor, temperatureColor } from '../lib/colorScale';
import { NODES, NON_MVP_ROOMS, ROOMS } from '../config/devices';
import type { RoomConfig } from '../config/devices';

const WALL_T = 0.15;
/** Batas tinggi tembok yang bisa diatur lewat panel (m). */
export const WALL_HEIGHT_MIN = 0.6;
export const WALL_HEIGHT_MAX = 3.0;

const toX = (x: number): number => x - 6;
const toZ = (z: number): number => z - 5;

const FLOOR_COLOR: Record<RoomStatus, string> = {
  NORMAL: '#cfe3cf',
  WARNING: '#fbe3b0',
  OFFLINE: '#f6c6c6',
  NO_DATA: '#e9e5db',
};

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

/** Segmen dinding dalam koordinat denah — semi-transparan agar isi ruangan
 *  terlihat dari luar; tinggi & opasitas dari pengaturan tampilan. */
function WallSegment(props: {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  height: number;
  opacity: number;
}) {
  const { x1, z1, x2, z2, height, opacity } = props;
  const len = Math.hypot(x2 - x1, z2 - z1);
  const cx = (x1 + x2) / 2 - 6;
  const cz = (z1 + z2) / 2 - 5;
  const alongX = Math.abs(x2 - x1) >= Math.abs(z2 - z1);
  return (
    <mesh
      position={[cx, height / 2, cz]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={alongX ? [len, height, WALL_T] : [WALL_T, height, len]} />
      <meshStandardMaterial
        color="#ddd6c8"
        roughness={0.9}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={opacity >= 1}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// Dinding: perimeter + sekat antar ruangan (koordinat denah).
const WALLS: Array<[number, number, number, number]> = [
  [0, 0, 12, 0],
  [0, 0, 0, 10],
  [12, 0, 12, 10],
  [0, 10, 12, 10],
  [0, 2.5, 12, 2.5],
  [3, 0, 3, 2.5],
  [5.5, 0, 5.5, 2.5],
  [8.5, 0, 8.5, 2.5],
  [10.5, 0, 10.5, 2.5],
  [2.5, 2.5, 2.5, 5.5],
  [5.5, 2.5, 5.5, 5.5],
  [9.5, 2.5, 9.5, 4],
  [10.5, 2.5, 10.5, 4],
  [9.5, 4, 12, 4],
  [9.5, 4, 9.5, 5.5],
  [0, 5.5, 12, 5.5],
  [2.5, 5.5, 2.5, 8.5],
  [4, 5.5, 4, 8],
  [7, 5.5, 7, 8],
  [9, 5.5, 9, 8.5],
  [10.5, 5.5, 10.5, 7.5],
  [9, 7, 10.5, 7],
  [10.5, 7.8, 12, 7.8],
  [9, 8.5, 12, 8.5],
  [4, 8, 9, 8],
  [0, 8.5, 2.5, 8.5],
];

function RoomLabel(props: { x: number; z: number; children: ReactNode; grey?: boolean }) {
  const showLabels = useIiotStore((s) => s.scene.showLabels);
  if (!showLabels) return null;
  return (
    <Html position={[toX(props.x), 0.06, toZ(props.z)]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <div
        style={{
          background: props.grey ? 'rgba(240,240,240,0.9)' : 'rgba(255,255,255,0.92)',
          border: '1px solid #d8d2c4',
          borderRadius: 6,
          padding: '2px 8px',
          fontSize: 11,
          fontWeight: 600,
          color: props.grey ? '#8a8a8a' : '#3f3a33',
          whiteSpace: 'nowrap',
          boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
          textAlign: 'center',
        }}
      >
        {props.children}
      </div>
    </Html>
  );
}

/** Satu pelat lantai (penuh, atau separuh bila mode 'both'). */
function FloorSlab(props: {
  cx: number;
  cz: number;
  w: number;
  d: number;
  color: string;
  status: RoomStatus;
  selected: boolean;
  onSelect: () => void;
}) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const color = props.color;
  useFrame(({ clock }) => {
    const m = matRef.current;
    if (!m) return;
    if (props.status === 'OFFLINE') {
      m.emissive.set('#991b1b');
      m.emissiveIntensity = 0.25 + Math.sin(clock.elapsedTime * 3) * 0.18;
    } else {
      m.emissive.set(color);
      m.emissiveIntensity = props.selected ? 0.18 : 0.04;
    }
  });
  return (
    <mesh
      position={[props.cx, 0.02, props.cz]}
      receiveShadow
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        props.onSelect();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto';
      }}
    >
      <boxGeometry args={[props.w, 0.04, props.d]} />
      <meshStandardMaterial ref={matRef} color={color} roughness={0.95} />
    </mesh>
  );
}

/** Lantai satu persegi ruangan.
 *  `colors`: 1 warna (mode status/suhu/kelembapan) atau 2 warna
 *  (mode 'both': separuh barat = suhu, separuh timur = kelembapan). */
function RoomFloorMesh(props: {
  rect: [number, number, number, number];
  status: RoomStatus;
  colors: string[];
  selected: boolean;
  onSelect: () => void;
}) {
  const [x0, z0, x1, z1] = props.rect;
  const w = x1 - x0;
  const d = z1 - z0;
  const cx = (x0 + x1) / 2 - 6;
  const cz = (z0 + z1) / 2 - 5;
  const halves = props.colors.length > 1;
  return (
    <group>
      {halves ? (
        <>
          <FloorSlab
            cx={cx - w / 4}
            cz={cz}
            w={w / 2}
            d={d}
            color={props.colors[0]}
            status={props.status}
            selected={props.selected}
            onSelect={props.onSelect}
          />
          <FloorSlab
            cx={cx + w / 4}
            cz={cz}
            w={w / 2}
            d={d}
            color={props.colors[1]}
            status={props.status}
            selected={props.selected}
            onSelect={props.onSelect}
          />
          {/* Garis pemisah antara sisi suhu dan kelembapan */}
          <Box position={[cx, 0.05, cz]} size={[0.04, 0.02, d]} color="#78716c" />
        </>
      ) : (
        <FloorSlab
          cx={cx}
          cz={cz}
          w={w}
          d={d}
          color={props.colors[0]}
          status={props.status}
          selected={props.selected}
          onSelect={props.onSelect}
        />
      )}
      {props.selected && (
        <group>
          <Box position={[cx, 0.05, z0 - 5]} size={[w, 0.02, 0.1]} color="#b45309" />
          <Box position={[cx, 0.05, z1 - 5]} size={[w, 0.02, 0.1]} color="#b45309" />
          <Box position={[x0 - 6, 0.05, cz]} size={[0.1, 0.02, d]} color="#b45309" />
          <Box position={[x1 - 6, 0.05, cz]} size={[0.1, 0.02, d]} color="#b45309" />
        </group>
      )}
    </group>
  );
}

/** Lantai ruangan non-MVP: abu-abu, label "di luar MVP", tidak bisa dipilih. */
function NonMvpFloor(props: { name: string; rect: [number, number, number, number] }) {
  const [x0, z0, x1, z1] = props.rect;
  const w = x1 - x0;
  const d = z1 - z0;
  const cx = (x0 + x1) / 2 - 6;
  const cz = (z0 + z1) / 2 - 5;
  const lx = (x0 + x1) / 2;
  const lz = (z0 + z1) / 2;
  return (
    <group>
      <mesh position={[cx, 0.015, cz]} receiveShadow>
        <boxGeometry args={[w, 0.03, d]} />
        <meshStandardMaterial color="#d5d5d5" roughness={0.95} />
      </mesh>
      <RoomLabel x={lx} z={lz} grey>
        {props.name}
        <br />
        <span style={{ fontWeight: 400, fontSize: 10 }}>di luar MVP</span>
      </RoomLabel>
    </group>
  );
}

/** Beacon node sensor: tiang kecil + LED status (denyut merah bila offline). */
function SensorBeacon(props: { deviceId: string; roomId: string; px: number; pz: number }) {
  const dev = useIiotStore((s) => s.devices[props.deviceId]);
  const setSelected = useIiotStore((s) => s.setSelectedRoomId);
  const showLabels = useIiotStore((s) => s.scene.showLabels);
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  const ledRef = useRef<THREE.MeshStandardMaterial>(null);
  const status = dev ? effectiveDeviceStatus(dev, Date.now()) : 'STALE';
  const color =
    status === 'ONLINE' ? '#22c55e' : status === 'STALE' ? '#f59e0b' : status === 'OFFLINE' ? '#ef4444' : '#9ca3af';
  useFrame(({ clock }) => {
    const m = ledRef.current;
    if (!m) return;
    m.emissiveIntensity = status === 'OFFLINE' ? 1.5 + Math.sin(clock.elapsedTime * 4) * 1.2 : 1.6;
  });
  return (
    <group
      position={[toX(props.px), 0, toZ(props.pz)]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        setSelected(props.roomId as RoomConfig['id']);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto';
      }}
    >
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[0.16, 1.2, 0.16]} />
        <meshStandardMaterial color="#374151" roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.28, 0]}>
        <boxGeometry args={[0.3, 0.22, 0.12]} />
        <meshStandardMaterial color="#1f2937" roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.28, 0.08]}>
        <sphereGeometry args={[0.06, 12, 10]} />
        <meshStandardMaterial ref={ledRef} color={color} emissive={color} emissiveIntensity={1.6} />
      </mesh>
      {showLabels && (
        <Html position={[0, 1.55, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              background: 'rgba(31,41,55,0.92)',
              color: '#fff',
              fontSize: 9,
              fontFamily: 'ui-monospace, monospace',
              padding: '1px 5px',
              borderRadius: 4,
              whiteSpace: 'nowrap',
            }}
          >
            {props.deviceId}
          </div>
        </Html>
      )}
    </group>
  );
}

// ---- Peralatan prosedural (posisi dalam koordinat denah) ----
function Rack(props: { px: number; pz: number; rotateY?: number }) {
  return (
    <group position={[toX(props.px), 0, toZ(props.pz)]} rotation={[0, props.rotateY ?? 0, 0]}>
      <Box position={[0, 0.9, 0]} size={[1.4, 1.8, 0.5]} color="#9aa5b1" />
      <Box position={[0, 0.45, 0]} size={[1.3, 0.06, 0.45]} color="#c7cfd8" />
      <Box position={[0, 0.95, 0]} size={[1.3, 0.06, 0.45]} color="#c7cfd8" />
      <Box position={[0, 1.45, 0]} size={[1.3, 0.06, 0.45]} color="#c7cfd8" />
      <Box position={[0, 1.1, 0]} size={[1.2, 0.25, 0.4]} color="#d9a441" />
    </group>
  );
}

function ChillerBox(props: { px: number; pz: number }) {
  const showLabels = useIiotStore((s) => s.scene.showLabels);
  return (
    <group position={[toX(props.px), 0, toZ(props.pz)]}>
      <Box position={[0, 1.0, 0]} size={[1.3, 2.0, 1.2]} color="#e8eef2" />
      <Box position={[0, 1.0, 0.62]} size={[1.1, 1.7, 0.04]} color="#b9cdd9" />
      {showLabels && (
        <Html position={[0, 2.3, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div style={{ fontSize: 20, lineHeight: 1 }}>❄</div>
        </Html>
      )}
    </group>
  );
}

function Stove(props: { px: number; pz: number }) {
  return (
    <group position={[toX(props.px), 0, toZ(props.pz)]}>
      <Box position={[0, 0.45, 0]} size={[2.4, 0.9, 0.8]} color="#8f9aa3" />
      {[-0.7, -0.25, 0.25, 0.7].map((dx) => (
        <mesh key={dx} position={[dx, 0.93, 0]} castShadow>
          <cylinderGeometry args={[0.16, 0.16, 0.04, 16]} />
          <meshStandardMaterial color="#222222" roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

function PackTable(props: { px: number; pz: number }) {
  return (
    <group position={[toX(props.px), 0, toZ(props.pz)]}>
      <Box position={[0, 0.45, 0]} size={[1.6, 0.08, 0.9]} color="#a9805a" />
      <Box position={[-0.7, 0.22, -0.35]} size={[0.08, 0.45, 0.08]} color="#7a5c40" />
      <Box position={[0.7, 0.22, -0.35]} size={[0.08, 0.45, 0.08]} color="#7a5c40" />
      <Box position={[-0.7, 0.22, 0.35]} size={[0.08, 0.45, 0.08]} color="#7a5c40" />
      <Box position={[0.7, 0.22, 0.35]} size={[0.08, 0.45, 0.08]} color="#7a5c40" />
      <Box position={[-0.3, 0.62, 0]} size={[0.4, 0.3, 0.4]} color="#d9a441" />
      <Box position={[0.35, 0.58, 0.1]} size={[0.3, 0.22, 0.3]} color="#e8e2d2" />
    </group>
  );
}

function SinkCounter(props: { px: number; pz: number }) {
  return (
    <group position={[toX(props.px), 0, toZ(props.pz)]}>
      <Box position={[0, 0.45, 0]} size={[1.0, 0.9, 0.6]} color="#cfd4d6" />
      <Box position={[0, 0.92, 0]} size={[0.7, 0.08, 0.4]} color="#8f9aa3" />
    </group>
  );
}

function Pallet(props: { px: number; pz: number; crates?: boolean }) {
  return (
    <group position={[toX(props.px), 0, toZ(props.pz)]}>
      <Box position={[0, 0.08, 0]} size={[1.1, 0.12, 1.1]} color="#b08d5f" />
      {props.crates !== false && (
        <>
          <Box position={[-0.25, 0.4, -0.2]} size={[0.5, 0.55, 0.5]} color="#d9a441" />
          <Box position={[0.28, 0.32, 0.25]} size={[0.45, 0.4, 0.45]} color="#c98f2e" />
        </>
      )}
    </group>
  );
}

function Locker(props: { px: number; pz: number }) {
  return (
    <group position={[toX(props.px), 0, toZ(props.pz)]}>
      <Box position={[0, 0.9, 0]} size={[1.2, 1.8, 0.45]} color="#7d8a99" />
      <Box position={[-0.35, 0.9, 0.24]} size={[0.02, 1.6, 0.02]} color="#5b6673" />
      <Box position={[0.35, 0.9, 0.24]} size={[0.02, 1.6, 0.02]} color="#5b6673" />
    </group>
  );
}

function Bin(props: { px: number; pz: number; color?: string }) {
  return (
    <mesh position={[toX(props.px), 0.45, toZ(props.pz)]} castShadow>
      <cylinderGeometry args={[0.28, 0.24, 0.9, 14]} />
      <meshStandardMaterial color={props.color ?? '#4b5563'} roughness={0.7} />
    </mesh>
  );
}

function Desk(props: { px: number; pz: number }) {
  return (
    <group position={[toX(props.px), 0, toZ(props.pz)]}>
      <Box position={[0, 0.38, 0]} size={[1.4, 0.07, 0.7]} color="#a9805a" />
      <Box position={[-0.6, 0.19, -0.28]} size={[0.07, 0.38, 0.07]} color="#7a5c40" />
      <Box position={[0.6, 0.19, -0.28]} size={[0.07, 0.38, 0.07]} color="#7a5c40" />
      <Box position={[-0.6, 0.19, 0.28]} size={[0.07, 0.38, 0.07]} color="#7a5c40" />
      <Box position={[0.6, 0.19, 0.28]} size={[0.07, 0.38, 0.07]} color="#7a5c40" />
      <Box position={[0, 0.55, -0.15]} size={[0.5, 0.35, 0.05]} color="#222222" />
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
  const rooms = useIiotStore((s) => s.rooms);
  const devices = useIiotStore((s) => s.devices);
  const alerts = useIiotStore((s) => s.alerts);
  const selectedRoomId = useIiotStore((s) => s.selectedRoomId);
  const setSelected = useIiotStore((s) => s.setSelectedRoomId);
  const autoRotate = useIiotStore((s) => s.scene.autoRotate);
  const shadows = useIiotStore((s) => s.scene.shadows);
  const quality = useIiotStore((s) => s.scene.quality);
  const wallHeight = useIiotStore((s) => s.scene.wallHeight);
  const wallOpacity = useIiotStore((s) => s.scene.wallOpacity);
  const showLabels = useIiotStore((s) => s.scene.showLabels);
  const showFurniture = useIiotStore((s) => s.scene.showFurniture);
  const vizMode = useIiotStore((s) => s.scene.vizMode);
  const tempMin = useIiotStore((s) => s.scene.tempMin);
  const tempMax = useIiotStore((s) => s.scene.tempMax);
  const humMin = useIiotStore((s) => s.scene.humMin);
  const humMax = useIiotStore((s) => s.scene.humMax);
  const [, setNow] = useState(Date.now());
  // Tick 5 detik agar status STALE/OFFLINE ikut berubah tanpa pesan baru.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const now = Date.now();
  const roomStatus = (room: RoomConfig): RoomStatus =>
    computeRoomStatus(room.id, { rooms, devices, alerts }, now);

  /** Warna lantai menurut mode visualisasi. Offline selalu merah berdenyut
   *  (alert harus tetap terlihat); tanpa data → abu-abu. Mode 'both'
   *  mengembalikan [warna suhu, warna kelembapan]. */
  const roomVizColors = (room: RoomConfig): string[] => {
    const status = roomStatus(room);
    if (status === 'OFFLINE') return [FLOOR_COLOR.OFFLINE];
    if (vizMode === 'status') return [FLOOR_COLOR[status]];
    const latest = rooms[room.id]?.latest;
    if (!latest) return [FLOOR_COLOR.NO_DATA];
    const t = temperatureColor(latest.temperature, tempMin, tempMax) ?? FLOOR_COLOR.NO_DATA;
    const h = humidityColor(latest.humidity, humMin, humMax) ?? FLOOR_COLOR.NO_DATA;
    if (vizMode === 'temperature') return [t];
    if (vizMode === 'humidity') return [h];
    return [t, h];
  };

  return (
    <SceneErrorBoundary>
      <Canvas
        dpr={[1, 2]}
        shadows={shadows}
        camera={{ position: [12, 13, 14], fov: 45 }}
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
            maxDistance={32}
            target={[0, 0, 0]}
          />

          {/* Halaman (tanah) di sekeliling bangunan */}
          <Box position={[0, -0.26, 0]} size={[30, 0.04, 30]} color="#c9c9c4" />

          {/* Alas lahan 12 × 10 m */}
          <Box position={[0, -0.12, 0]} size={[12.4, 0.24, 10.4]} color="#b9b3a6" />

          {/* Lantai ruangan MVP + label */}
          {ROOMS.map((room) => {
            const status = roomStatus(room);
            const selected = selectedRoomId === room.id;
            const colors = roomVizColors(room);
            return (
              <group key={room.id}>
                {room.rects.map((rect, i) => (
                  <RoomFloorMesh
                    key={i}
                    rect={rect}
                    status={status}
                    colors={colors}
                    selected={selected}
                    onSelect={() => setSelected(room.id)}
                  />
                ))}
                <RoomLabel x={(room.rects[0][0] + room.rects[0][2]) / 2} z={(room.rects[0][1] + room.rects[0][3]) / 2}>
                  {room.id} · {room.name}
                </RoomLabel>
                {room.rects.length > 1 && (
                  <RoomLabel x={(room.rects[1][0] + room.rects[1][2]) / 2} z={(room.rects[1][1] + room.rects[1][3]) / 2}>
                    {room.id} · {room.name}
                  </RoomLabel>
                )}
              </group>
            );
          })}

          {/* Lantai ruangan non-MVP */}
          {NON_MVP_ROOMS.map((r) => (
            <NonMvpFloor key={r.name} name={r.name} rect={r.rect} />
          ))}

          {/* Dinding — rendah & transparan (lihat pengaturan tampilan) */}
          {WALLS.map(([x1, z1, x2, z2], i) => (
            <WallSegment key={i} x1={x1} z1={z1} x2={x2} z2={z2} height={wallHeight} opacity={wallOpacity} />
          ))}

          {/* Peralatan/perabot ruangan — bisa disembunyikan lewat toggle;
              beacon sensor TIDAK termasuk perabot dan selalu tampil. */}
          {showFurniture && (
            <>
              {/* Peralatan — R04 pencucian */}
              <SinkCounter px={0.7} pz={0.5} />
              <SinkCounter px={1.8} pz={0.5} />
              <SinkCounter px={2.4} pz={1.8} />
              {/* R02 gudang kering */}
              <Rack px={3.7} pz={0.6} />
              <Rack px={4.9} pz={0.6} />
              <Rack px={3.7} pz={1.9} />
              {/* R03 chiller/freezer */}
              <ChillerBox px={6.4} pz={1.2} />
              <ChillerBox px={7.9} pz={1.2} />
              {/* R01 penerimaan */}
              <Pallet px={9.1} pz={1.6} />
              <Pallet px={10.0} pz={1.0} crates={false} />
              {/* R07A barat */}
              <Rack px={0.7} pz={3.3} rotateY={Math.PI / 2} />
              <Rack px={0.7} pz={4.6} rotateY={Math.PI / 2} />
              <Rack px={1.8} pz={3.3} />
              {/* R06 pengemasan */}
              <PackTable px={3.3} pz={3.6} />
              <PackTable px={4.7} pz={3.6} />
              <PackTable px={4.0} pz={4.7} />
              {/* R05 dapur */}
              <Stove px={6.9} pz={3.1} />
              <Box position={[toX(8.9), 0.45, toZ(3.1)]} size={[0.9, 0.9, 0.8]} color="#cfd4d6" />
              <PackTable px={7.2} pz={4.7} />
              {/* R07B selatan */}
              <Rack px={4.7} pz={6.3} />
              <Rack px={5.9} pz={6.3} />
              {/* R08 pengiriman */}
              <Pallet px={0.8} pz={6.4} />
              <Pallet px={1.6} pz={7.5} />
              <Pallet px={0.8} pz={7.9} crates={false} />
              {/* Non-MVP: loker, toilet, sampah, janitor, pencucian alat, kantor */}
              <Locker px={7.5} pz={6.0} />
              <Locker px={8.4} pz={6.0} />
              <Box position={[toX(9.7), 0.35, toZ(7.9)]} size={[0.5, 0.7, 0.6]} color="#f5f5f2" />
              <Bin px={11.2} pz={6.2} />
              <Bin px={11.2} pz={7.0} color="#6b7280" />
              <Rack px={11.3} pz={3.0} />
              <SinkCounter px={10.3} pz={4.7} />
              <Desk px={10.5} pz={9.2} />
            </>
          )}

          {/* Beacon node sensor (9 node, satu per ruangan) */}
          {NODES.map((n) => {
            const room = ROOMS.find((r) => r.id === n.roomId) ?? ROOMS[0];
            const rect = room.rects[0];
            return (
              <SensorBeacon
                key={n.deviceId}
                deviceId={n.deviceId}
                roomId={n.roomId}
                px={rect[0] + 0.35}
                pz={rect[1] + 0.35}
              />
            );
          })}

          {/* Panah utara */}
          <group position={[toX(11.4), 0, toZ(-0.9)]}>
            <mesh position={[0, 0.25, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
              <coneGeometry args={[0.3, 0.9, 4]} />
              <meshStandardMaterial color="#991b1b" roughness={0.6} />
            </mesh>
            {showLabels && (
              <Html position={[0, 0.7, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
                <div
                  style={{
                    background: 'rgba(255,255,255,0.92)',
                    border: '1px solid #d8d2c4',
                    borderRadius: 6,
                    padding: '2px 8px',
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#991b1b',
                    whiteSpace: 'nowrap',
                  }}
                >
                  N · Utara
                </div>
              </Html>
            )}
          </group>

          {quality === 'low' && <fog attach="fog" args={['#eef1f4', 25, 45]} />}
        </Suspense>
      </Canvas>
    </SceneErrorBoundary>
  );
}
