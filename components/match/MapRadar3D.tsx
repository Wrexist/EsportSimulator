"use client"

/**
 * True-3D match radar — an opt-in WebGL renderer (React Three Fiber + drei)
 * behind the radar's "3D" toggle. It consumes the exact same data the 2D/2.5D
 * SVG radar does (no engine changes); it is render-only and dynamically imported
 * (ssr:false) so three.js never enters the main bundle until 3D is selected.
 *
 * Coordinate mapping: radar coords are x∈[0,100] (left→right) and y∈[0,100]
 * (top→bottom). The ground plane is a 100×100 quad centred at the origin laid
 * flat on XZ; with the texture's default flipY this resolves to
 * worldX = x-50, worldZ = y-50 (derived, then verified visually), so tokens
 * land exactly on their map positions.
 *
 * Offline note: labels use drei <Html> (the app's own CSS fonts), NOT drei
 * <Text> — troika would fetch a remote font, which fails in the packaged
 * Steam/Electron build.
 *
 * Interaction: a one-shot camera fly-in on mount (skipped under reduced motion),
 * drag to orbit, gentle idle auto-rotate, and click a player to recentre the
 * orbit on them (click the map to recentre on the bomb-site midpoint).
 */

import { Suspense, useEffect, useLayoutEffect, useState, useRef, Component, type ReactNode } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { OrbitControls, useTexture, Line, ContactShadows, Grid, Html } from "@react-three/drei"
import * as THREE from "three"
import type { Line2, OrbitControls as OrbitControlsImpl } from "three-stdlib"
import type { RadarPlayerDot, RadarBombState } from "@/lib/radar-position-engine"

const CT_COLOR = "#5b9bd5"
const T_COLOR = "#e8a838"
const PLANE = 100
const EDGE = PLANE / 2

const toWorldX = (x: number) => x - 50
const toWorldZ = (y: number) => y - 50

const setCursor = (c: string) => {
    if (typeof document !== "undefined") document.body.style.cursor = c
}

function ecoColor(money?: number): string {
    if (money == null) return "#ffffff"
    return money >= 4500 ? "#ffffff" : money >= 2000 ? "#f59e0b" : "#ef4444"
}

function shortName(name: string): string {
    const safe = (name || "PLAYER").toUpperCase()
    return safe.length <= 7 ? safe : safe.slice(0, 7)
}

// Shared flat vision-cone geometry — apex at origin pointing +X, lying on XZ.
// One instance is reused by every token (only the mesh transform differs), so a
// busy round never rebuilds geometry. Module-scoped: created once, when this
// dynamically-imported module first loads.
const CONE_LEN = 9
const CONE_HALF = 0.4 // ~23° half-angle, mirrors the 2D cone
const CONE_GEO = (() => {
    const w = Math.tan(CONE_HALF) * CONE_LEN
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
        0, 0, 0,
        CONE_LEN, 0, -w,
        CONE_LEN, 0, w,
    ]), 3))
    geo.computeVertexNormals()
    return geo
})()

interface MapRadar3DProps {
    radarSrc: string
    dots: RadarPlayerDot[]
    killLines: Array<{ line: { fromX: number; fromY: number; toX: number; toY: number; isHeadshot?: boolean }; fadeOpacity: number }>
    smokes: Array<{ smoke: { x: number; y: number; radius: number }; opacity: number }>
    bombPosition?: { x: number; y: number }
    bombVisible?: boolean
    bombState?: RadarBombState
    currentTime?: number
    onError?: () => void
}

function usePrefersReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false)
    useEffect(() => {
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
        const update = () => setReduced(mq.matches)
        update()
        mq.addEventListener?.("change", update)
        return () => mq.removeEventListener?.("change", update)
    }, [])
    return reduced
}

/**
 * Drives the camera: a one-shot ease-out fly-in on mount (OrbitControls stays
 * disabled until it finishes), then per-frame it lerps the orbit target toward
 * focusRef so clicking a player smoothly recentres the view.
 */
function CameraRig({ controlsRef, focusRef, introDone, onIntroDone }: {
    controlsRef: React.MutableRefObject<OrbitControlsImpl | null>
    focusRef: React.MutableRefObject<THREE.Vector3>
    introDone: boolean
    onIntroDone: () => void
}) {
    const { camera } = useThree()
    const t = useRef(0)
    const start = useRef(new THREE.Vector3(10, 150, 30))
    const target = useRef(new THREE.Vector3(22, 62, 56))

    useLayoutEffect(() => {
        if (!introDone) camera.position.copy(start.current)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useFrame((_, delta) => {
        if (!introDone) {
            t.current = Math.min(1, t.current + delta / 1.3)
            const e = 1 - Math.pow(1 - t.current, 3) // easeOutCubic
            camera.position.lerpVectors(start.current, target.current, e)
            camera.lookAt(0, 0, 0)
            if (t.current >= 1) onIntroDone()
            return
        }
        const controls = controlsRef.current
        if (controls) {
            controls.target.lerp(focusRef.current, 0.12)
            controls.update()
        }
    })
    return null
}

function Ground({ src, onReset }: { src: string; onReset: () => void }) {
    const tex = useTexture(src)
    useEffect(() => {
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = 8
        tex.needsUpdate = true
    }, [tex])
    return (
        // map surface — unlit + toneMapped off so the texture shows at full,
        // consistent brightness (R3F's default ACES tone mapping otherwise
        // darkens it); the 3D read comes from perspective + standing tokens.
        // Clicking the map clears any player focus.
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} onClick={(e) => { e.stopPropagation(); onReset() }}>
            <planeGeometry args={[PLANE, PLANE]} />
            <meshBasicMaterial map={tex} toneMapped={false} transparent opacity={0.98} />
        </mesh>
    )
}

/** Glowing tactical frame around the map edge; turns red and pulses while the bomb is live. */
function FrameBorder({ danger }: { danger: boolean }) {
    const ref = useRef<Line2>(null)
    useFrame(({ clock }) => {
        const mat = ref.current?.material as THREE.Material | undefined
        if (!mat) return
        mat.opacity = danger ? 0.5 + Math.sin(clock.elapsedTime * 4) * 0.3 : 0.45
    })
    return (
        <Line
            ref={ref}
            points={[
                [-EDGE, 0.12, -EDGE], [EDGE, 0.12, -EDGE],
                [EDGE, 0.12, EDGE], [-EDGE, 0.12, EDGE], [-EDGE, 0.12, -EDGE],
            ]}
            color={danger ? "#ff3b3b" : "#38d6e6"}
            lineWidth={1.5}
            transparent
            opacity={0.45}
            toneMapped={false}
        />
    )
}

function PlayerToken({ dot, onFocus }: { dot: RadarPlayerDot; onFocus: (x: number, z: number) => void }) {
    const wx = toWorldX(dot.x)
    const wz = toWorldZ(dot.y)
    const color = dot.side === "ct" ? CT_COLOR : T_COLOR
    const eco = ecoColor(dot.money)
    // Fade the name label out as the camera pulls back, so a zoomed-out board
    // doesn't drown in nameplates. Written straight to the DOM node each frame
    // (no React re-render).
    const labelRef = useRef<HTMLDivElement>(null)
    useFrame(({ camera }) => {
        if (!labelRef.current) return
        const d = camera.position.length() // distance to the orbit target (origin-ish)
        labelRef.current.style.opacity = THREE.MathUtils.clamp((150 - d) / 50, 0, 1).toFixed(2)
    })
    return (
        <group>
            {/* economy / selection ring on the ground */}
            <mesh position={[wx, 0.08, wz]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[2.0, 2.6, 32]} />
                <meshBasicMaterial color={eco} toneMapped={false} transparent opacity={0.8} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            {/* facing vision cone (flat on the floor) */}
            <mesh geometry={CONE_GEO} position={[wx, 0.12, wz]} rotation={[0, -dot.angle, 0]}>
                <meshBasicMaterial color={color} transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            {/* peg */}
            <mesh position={[wx, 1.7, wz]} castShadow>
                <cylinderGeometry args={[0.22, 0.34, 3.4, 12]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} roughness={0.45} metalness={0.1} />
            </mesh>
            {/* bead head — click to focus the camera on this player */}
            <mesh
                position={[wx, 4.6, wz]}
                castShadow
                onClick={(e) => { e.stopPropagation(); onFocus(wx, wz) }}
                onPointerOver={(e) => { e.stopPropagation(); setCursor("pointer") }}
                onPointerOut={() => setCursor("")}
            >
                <sphereGeometry args={[1.85, 32, 32]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.65} roughness={0.25} metalness={0.2} />
            </mesh>
            {/* additive glow halo (fakes bloom against the dark map) */}
            <mesh position={[wx, 4.6, wz]}>
                <sphereGeometry args={[2.9, 16, 16]} />
                <meshBasicMaterial color={color} transparent opacity={0.16} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
            </mesh>
            {/* floating name label — DOM (app font), always faces the camera.
                No distanceFactor: constant small screen-size, so it never bloats. */}
            <Html position={[wx, 6.7, wz]} center zIndexRange={[20, 0]} pointerEvents="none" prepend>
                <div
                    ref={labelRef}
                    style={{
                        fontSize: 8.5,
                        fontWeight: 700,
                        letterSpacing: "0.03em",
                        color: dot.side === "ct" ? "#cfe6ff" : "#ffe3b8",
                        background: "rgba(8,11,16,0.55)",
                        border: `1px solid ${color}66`,
                        borderRadius: 4,
                        padding: "0px 4px",
                        lineHeight: 1.5,
                        textShadow: "0 1px 2px #000",
                        whiteSpace: "nowrap",
                        userSelect: "none",
                        pointerEvents: "none",
                        transform: "translateY(-2px)",
                    }}
                >
                    {shortName(dot.nickname)}
                </div>
            </Html>
        </group>
    )
}

function DeadMarker({ x, y, opacity }: { x: number; y: number; opacity: number }) {
    const wx = toWorldX(x)
    const wz = toWorldZ(y)
    return (
        <group position={[wx, 0.16, wz]}>
            {[Math.PI / 4, -Math.PI / 4].map((r, i) => (
                <mesh key={i} rotation={[-Math.PI / 2, 0, r]}>
                    <planeGeometry args={[4.5, 0.7]} />
                    <meshBasicMaterial color="#ff3333" toneMapped={false} transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={false} />
                </mesh>
            ))}
        </group>
    )
}

function BombMarker({ x, y }: { x: number; y: number }) {
    const ref = useRef<THREE.Mesh>(null)
    useFrame(({ clock }) => {
        if (ref.current) {
            const s = 1 + Math.sin(clock.elapsedTime * 4) * 0.16
            ref.current.scale.setScalar(s)
        }
    })
    const wx = toWorldX(x)
    const wz = toWorldZ(y)
    return (
        <group position={[wx, 0, wz]}>
            <mesh ref={ref} position={[0, 3, 0]} castShadow>
                <octahedronGeometry args={[2.2, 0]} />
                <meshBasicMaterial color="#ff4444" toneMapped={false} />
            </mesh>
            {/* glow halo */}
            <mesh position={[0, 3, 0]}>
                <sphereGeometry args={[3.6, 16, 16]} />
                <meshBasicMaterial color="#ff3333" transparent opacity={0.18} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
            </mesh>
            <mesh position={[0, 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[2.8, 3.6, 32]} />
                <meshBasicMaterial color="#ff3333" toneMapped={false} transparent opacity={0.7} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
        </group>
    )
}

function Scene({ radarSrc, dots, killLines, smokes, bombPosition, bombVisible, bombState, currentTime, reducedMotion }: MapRadar3DProps & { reducedMotion: boolean }) {
    const alive = dots.filter(d => d.isAlive)
    const deadRecent = dots.filter(d => !d.isAlive && d.deathTime != null && currentTime != null && currentTime - d.deathTime < 4)
    const showBomb = !!(bombVisible && bombState?.planted && !bombState.defused && !bombState.exploded && bombPosition)

    const controlsRef = useRef<OrbitControlsImpl | null>(null)
    const focusRef = useRef(new THREE.Vector3(0, 0, 0))
    const [introDone, setIntroDone] = useState(reducedMotion) // reduced motion → no fly-in

    const focusPlayer = (x: number, z: number) => focusRef.current.set(x, 3, z)
    const resetFocus = () => focusRef.current.set(0, 0, 0)

    return (
        <>
            <ambientLight intensity={0.7} />
            <hemisphereLight intensity={0.45} color="#bcd4ff" groundColor="#1a1d26" />
            <directionalLight position={[34, 60, 28]} intensity={1.15} />
            <directionalLight position={[-40, 30, -25]} intensity={0.3} color="#88aaff" />

            {/* faint holographic floor grid receding into the dark */}
            <Grid
                position={[0, -0.5, 0]}
                args={[10, 10]}
                cellSize={10}
                cellThickness={0.7}
                cellColor="#1f2c45"
                sectionSize={50}
                sectionThickness={1.2}
                sectionColor="#2b5f7d"
                fadeDistance={260}
                fadeStrength={2.6}
                infiniteGrid
                followCamera={false}
            />

            <Suspense fallback={null}>
                <Ground src={radarSrc} onReset={resetFocus} />
            </Suspense>
            <FrameBorder danger={showBomb} />

            {/* soft contact shadows ground the tokens onto the map */}
            <ContactShadows position={[0, 0.25, 0]} scale={120} blur={2.6} far={22} opacity={0.5} color="#000000" resolution={512} />

            {alive.map(dot => <PlayerToken key={dot.playerId} dot={dot} onFocus={focusPlayer} />)}

            {deadRecent.map(dot => (
                <DeadMarker
                    key={dot.playerId}
                    x={dot.x}
                    y={dot.y}
                    opacity={Math.max(0, 1 - (currentTime! - dot.deathTime!) / 4) * 0.8}
                />
            ))}

            {showBomb && <BombMarker x={bombPosition!.x} y={bombPosition!.y} />}

            {killLines.map(({ line, fadeOpacity }, i) => (
                <Line
                    key={`kill-${i}`}
                    points={[
                        [toWorldX(line.fromX), 0.5, toWorldZ(line.fromY)],
                        [toWorldX(line.toX), 0.5, toWorldZ(line.toY)],
                    ]}
                    color={line.isHeadshot ? "#ff6666" : "#ff3333"}
                    lineWidth={line.isHeadshot ? 2.2 : 1.3}
                    transparent
                    opacity={fadeOpacity * 0.85}
                    toneMapped={false}
                />
            ))}

            {smokes.map(({ smoke, opacity }, i) => (
                <mesh key={`smoke-${i}`} position={[toWorldX(smoke.x), Math.max(2.5, smoke.radius * 0.55), toWorldZ(smoke.y)]}>
                    <sphereGeometry args={[Math.max(1, smoke.radius), 16, 16]} />
                    <meshStandardMaterial color="#cfcfcf" transparent opacity={Math.min(0.6, opacity * 1.6)} roughness={1} />
                </mesh>
            ))}

            <CameraRig controlsRef={controlsRef} focusRef={focusRef} introDone={introDone} onIntroDone={() => setIntroDone(true)} />

            <OrbitControls
                ref={controlsRef}
                enabled={introDone}
                target={[0, 0, 0]}
                enablePan={false}
                enableDamping
                dampingFactor={0.08}
                minDistance={48}
                maxDistance={185}
                minPolarAngle={0.12}
                maxPolarAngle={1.45}
                autoRotate={introDone && !reducedMotion}
                autoRotateSpeed={0.35}
            />
        </>
    )
}

class WebGLErrorBoundary extends Component<{ onError?: () => void; children: ReactNode }, { failed: boolean }> {
    state = { failed: false }
    static getDerivedStateFromError() {
        return { failed: true }
    }
    componentDidCatch() {
        this.props.onError?.()
    }
    render() {
        return this.state.failed ? null : this.props.children
    }
}

export default function MapRadar3D(props: MapRadar3DProps) {
    const reduced = usePrefersReducedMotion()
    return (
        <WebGLErrorBoundary onError={props.onError}>
            <Canvas
                dpr={[1, 2]}
                shadows
                camera={{ position: [22, 62, 56], fov: 38 }}
                gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
                style={{ width: "100%", height: "100%" }}
            >
                <Scene {...props} reducedMotion={reduced} />
            </Canvas>
        </WebGLErrorBoundary>
    )
}
