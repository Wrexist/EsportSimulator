"use client"

import { Canvas, useFrame } from "@react-three/fiber"
import { ContactShadows, OrbitControls } from "@react-three/drei"
import { useMemo, useRef } from "react"
import * as THREE from "three"

import {
    derivePortraitFeatures,
    type PortraitFeatures,
    type Hairstyle,
    type HeadShape,
    type Accessory,
    type FacialHair,
} from "@/lib/safe-branding/portrait-features"

interface Player3DPortraitProps {
    seed: string
    /** Box dimensions in CSS pixels. */
    size?: number
    className?: string
    /** Auto-rotate the head. Defaults to true. */
    autoRotate?: boolean
    /** Allow drag-to-rotate. Defaults to true. */
    interactive?: boolean
}

const HEAD_GEOM: Record<HeadShape, [number, number, number]> = {
    round: [1.0, 1.05, 0.95],
    oval: [0.95, 1.18, 0.95],
    tall: [0.88, 1.25, 0.92],
    wide: [1.15, 1.0, 0.95],
    square: [1.05, 1.1, 1.0],
}

function Head({ features }: { features: PortraitFeatures }) {
    const group = useRef<THREE.Group>(null)
    const skinMat = useMemo(
        () => new THREE.MeshStandardMaterial({ color: features.skin, roughness: 0.55, metalness: 0.05 }),
        [features.skin],
    )
    const hairMat = useMemo(
        () => new THREE.MeshStandardMaterial({ color: features.hairColor, roughness: 0.65, metalness: 0.04 }),
        [features.hairColor],
    )
    const beardMat = useMemo(
        () => new THREE.MeshStandardMaterial({ color: features.facialHairColor, roughness: 0.7, metalness: 0.02 }),
        [features.facialHairColor],
    )
    const shirtMat = useMemo(
        () => new THREE.MeshStandardMaterial({ color: features.shirt, roughness: 0.8, metalness: 0.02 }),
        [features.shirt],
    )
    const accessoryDark = useMemo(
        () => new THREE.MeshStandardMaterial({ color: "#0F1116", roughness: 0.4, metalness: 0.3 }),
        [],
    )
    const accentMat = useMemo(
        () => new THREE.MeshStandardMaterial({ color: features.accent, roughness: 0.4, metalness: 0.4, emissive: features.accent, emissiveIntensity: 0.2 }),
        [features.accent],
    )
    const eyeMat = useMemo(
        () => new THREE.MeshStandardMaterial({ color: features.eyeColor, roughness: 0.25 }),
        [features.eyeColor],
    )
    const eyeWhiteMat = useMemo(
        () => new THREE.MeshStandardMaterial({ color: "#F1F5F9", roughness: 0.3 }),
        [],
    )
    const mouthMat = useMemo(
        () => new THREE.MeshStandardMaterial({ color: "#3A1F1A", roughness: 0.6 }),
        [],
    )
    const browMat = useMemo(
        () => new THREE.MeshStandardMaterial({ color: features.browColor, roughness: 0.7 }),
        [features.browColor],
    )

    const [hx, hy, hz] = HEAD_GEOM[features.headShape]

    return (
        <group ref={group} position={[0, -0.2, 0]}>
            {/* Shoulders */}
            <mesh position={[0, -1.55, 0]} material={shirtMat}>
                <capsuleGeometry args={[1.35, 0.35, 6, 16]} />
            </mesh>
            <mesh position={[0, -1.05, 0.05]} material={shirtMat}>
                <coneGeometry args={[1.45, 0.7, 18, 1, true]} />
            </mesh>

            {/* Neck */}
            <mesh position={[0, -0.7, 0]} material={skinMat}>
                <cylinderGeometry args={[0.32, 0.36, 0.5, 16]} />
            </mesh>

            {/* Head */}
            <mesh material={skinMat} scale={[hx, hy, hz]}>
                <sphereGeometry args={[1, 32, 24]} />
            </mesh>

            {/* Ears */}
            <mesh position={[-0.97, -0.05, 0]} rotation={[0, 0, Math.PI / 2]} material={skinMat}>
                <capsuleGeometry args={[0.1, 0.18, 4, 8]} />
            </mesh>
            <mesh position={[0.97, -0.05, 0]} rotation={[0, 0, Math.PI / 2]} material={skinMat}>
                <capsuleGeometry args={[0.1, 0.18, 4, 8]} />
            </mesh>

            {/* Brow ridge */}
            <Brows features={features} material={browMat} />

            {/* Eyes */}
            <Eyes features={features} whiteMat={eyeWhiteMat} pupilMat={eyeMat} />

            {/* Nose hint */}
            <mesh position={[0, -0.05, 0.92]} material={skinMat}>
                <coneGeometry args={[0.08, 0.22, 6]} />
            </mesh>

            {/* Mouth */}
            <Mouth features={features} material={mouthMat} />

            {/* Facial hair */}
            <FacialHairMesh features={features} material={beardMat} />

            {/* Hair */}
            <Hair features={features} material={hairMat} />

            {/* Accessory */}
            <AccessoryMesh
                features={features}
                darkMat={accessoryDark}
                accentMat={accentMat}
            />
        </group>
    )
}

function Brows({ features, material }: { features: PortraitFeatures; material: THREE.Material }) {
    const yOffset = features.browStyle === "raised" ? 0.36 : 0.32
    const tilt = features.browStyle === "stern" ? -0.2 : features.browStyle === "raised" ? 0.15 : 0
    const thickness = features.browStyle === "thin" ? 0.04 : 0.07
    return (
        <>
            <mesh position={[-0.32, yOffset, 0.85]} rotation={[0, 0, tilt]} material={material}>
                <boxGeometry args={[0.32, thickness, 0.05]} />
            </mesh>
            <mesh position={[0.32, yOffset, 0.85]} rotation={[0, 0, -tilt]} material={material}>
                <boxGeometry args={[0.32, thickness, 0.05]} />
            </mesh>
        </>
    )
}

function Eyes({
    features,
    whiteMat,
    pupilMat,
}: {
    features: PortraitFeatures
    whiteMat: THREE.Material
    pupilMat: THREE.Material
}) {
    if (features.eyeStyle === "closed") {
        // Two thin arcs.
        return (
            <>
                <mesh position={[-0.32, 0.18, 0.88]} material={pupilMat}>
                    <boxGeometry args={[0.22, 0.02, 0.02]} />
                </mesh>
                <mesh position={[0.32, 0.18, 0.88]} material={pupilMat}>
                    <boxGeometry args={[0.22, 0.02, 0.02]} />
                </mesh>
            </>
        )
    }
    const whiteScale =
        features.eyeStyle === "wide" ? [0.18, 0.16, 0.05] :
            features.eyeStyle === "narrow" ? [0.2, 0.06, 0.05] :
                features.eyeStyle === "almond" ? [0.2, 0.12, 0.05] :
                    [0.12, 0.12, 0.05] // dot
    const pupilSize = features.eyeStyle === "wide" ? 0.085 : features.eyeStyle === "narrow" ? 0.05 : 0.07

    return (
        <>
            <mesh position={[-0.32, 0.18, 0.88]} scale={whiteScale as [number, number, number]} material={whiteMat}>
                <sphereGeometry args={[1, 16, 12]} />
            </mesh>
            <mesh position={[0.32, 0.18, 0.88]} scale={whiteScale as [number, number, number]} material={whiteMat}>
                <sphereGeometry args={[1, 16, 12]} />
            </mesh>
            <mesh position={[-0.32, 0.18, 0.94]} material={pupilMat}>
                <sphereGeometry args={[pupilSize, 12, 12]} />
            </mesh>
            <mesh position={[0.32, 0.18, 0.94]} material={pupilMat}>
                <sphereGeometry args={[pupilSize, 12, 12]} />
            </mesh>
        </>
    )
}

function Mouth({ features, material }: { features: PortraitFeatures; material: THREE.Material }) {
    switch (features.mouthStyle) {
        case "smile":
            return (
                <mesh position={[0, -0.32, 0.88]} rotation={[0, 0, 0]} material={material}>
                    <torusGeometry args={[0.18, 0.022, 8, 16, Math.PI]} />
                </mesh>
            )
        case "smirk":
            return (
                <mesh position={[0.05, -0.32, 0.88]} rotation={[0, 0, 0.2]} material={material}>
                    <torusGeometry args={[0.16, 0.022, 8, 16, Math.PI * 0.8]} />
                </mesh>
            )
        case "neutral":
            return (
                <mesh position={[0, -0.32, 0.88]} material={material}>
                    <boxGeometry args={[0.3, 0.06, 0.04]} />
                </mesh>
            )
        case "grimace":
            return (
                <mesh position={[0, -0.32, 0.88]} material={material}>
                    <boxGeometry args={[0.32, 0.1, 0.04]} />
                </mesh>
            )
        case "line":
        default:
            return (
                <mesh position={[0, -0.32, 0.88]} material={material}>
                    <boxGeometry args={[0.28, 0.025, 0.03]} />
                </mesh>
            )
    }
}

function FacialHairMesh({ features, material }: { features: PortraitFeatures; material: THREE.Material }) {
    if (features.facialHair === "clean") return null
    if (features.facialHair === "stubble") {
        // Subtle dusting via slightly darker face mask.
        return (
            <mesh position={[0, -0.45, 0.5]} material={material} scale={[0.95, 0.5, 0.6]}>
                <sphereGeometry args={[0.9, 24, 18, 0, Math.PI * 2, Math.PI / 2.4, Math.PI / 3]} />
            </mesh>
        )
    }
    if (features.facialHair === "goatee") {
        return (
            <>
                <mesh position={[0, -0.5, 0.85]} material={material}>
                    <coneGeometry args={[0.12, 0.28, 12]} />
                </mesh>
                <mesh position={[0, -0.34, 0.88]} material={material}>
                    <boxGeometry args={[0.28, 0.06, 0.04]} />
                </mesh>
            </>
        )
    }
    if (features.facialHair === "mustache") {
        return (
            <mesh position={[0, -0.22, 0.92]} material={material}>
                <boxGeometry args={[0.42, 0.08, 0.04]} />
            </mesh>
        )
    }
    // beard
    return (
        <>
            <mesh position={[0, -0.55, 0.6]} material={material} scale={[0.95, 0.7, 0.7]}>
                <sphereGeometry args={[0.95, 24, 18, 0, Math.PI * 2, Math.PI / 2.6, Math.PI / 2.4]} />
            </mesh>
            <mesh position={[0, -0.22, 0.92]} material={material}>
                <boxGeometry args={[0.42, 0.08, 0.04]} />
            </mesh>
        </>
    )
}

function Hair({ features, material }: { features: PortraitFeatures; material: THREE.Material }) {
    const style: Hairstyle = features.hairstyle
    switch (style) {
        case "bald":
            return null
        case "buzz":
            return (
                <mesh position={[0, 0.15, 0]} material={material} scale={[1.02, 1.02, 1.02]}>
                    <sphereGeometry args={[1, 24, 18, 0, Math.PI * 2, 0, Math.PI / 2.5]} />
                </mesh>
            )
        case "short":
            return (
                <mesh position={[0, 0.18, 0]} material={material} scale={[1.06, 1.06, 1.06]}>
                    <sphereGeometry args={[1, 28, 22, 0, Math.PI * 2, 0, Math.PI / 1.9]} />
                </mesh>
            )
        case "side":
            return (
                <group>
                    <mesh position={[0, 0.18, 0]} material={material} scale={[1.06, 1.04, 1.06]}>
                        <sphereGeometry args={[1, 28, 22, 0, Math.PI * 2, 0, Math.PI / 2.1]} />
                    </mesh>
                    <mesh position={[0.4, 0.42, 0.55]} rotation={[0, 0, -0.4]} material={material}>
                        <boxGeometry args={[0.55, 0.18, 0.45]} />
                    </mesh>
                </group>
            )
        case "curly":
            return (
                <group>
                    <mesh position={[0, 0.25, 0]} material={material} scale={[1.18, 1.1, 1.18]}>
                        <sphereGeometry args={[1, 22, 18, 0, Math.PI * 2, 0, Math.PI / 1.8]} />
                    </mesh>
                    {[
                        [-0.6, 0.6, 0.5], [0.6, 0.6, 0.5], [0, 0.85, 0.4],
                        [-0.85, 0.3, 0.3], [0.85, 0.3, 0.3], [-0.4, 0.85, 0],
                        [0.4, 0.85, 0],
                    ].map(([x, y, z], i) => (
                        <mesh key={i} position={[x, y, z]} material={material}>
                            <sphereGeometry args={[0.18, 10, 10]} />
                        </mesh>
                    ))}
                </group>
            )
        case "long":
            return (
                <group>
                    <mesh position={[0, 0.18, 0]} material={material} scale={[1.08, 1.08, 1.08]}>
                        <sphereGeometry args={[1, 28, 22, 0, Math.PI * 2, 0, Math.PI / 1.7]} />
                    </mesh>
                    <mesh position={[0, -0.6, -0.4]} material={material}>
                        <boxGeometry args={[1.6, 1.2, 0.5]} />
                    </mesh>
                </group>
            )
        case "ponytail":
            return (
                <group>
                    <mesh position={[0, 0.18, 0]} material={material} scale={[1.06, 1.06, 1.06]}>
                        <sphereGeometry args={[1, 28, 22, 0, Math.PI * 2, 0, Math.PI / 1.9]} />
                    </mesh>
                    <mesh position={[0, -0.05, -0.95]} rotation={[0.3, 0, 0]} material={material}>
                        <capsuleGeometry args={[0.15, 0.7, 6, 12]} />
                    </mesh>
                </group>
            )
        case "manbun":
            return (
                <group>
                    <mesh position={[0, 0.18, 0]} material={material} scale={[1.06, 1.06, 1.06]}>
                        <sphereGeometry args={[1, 28, 22, 0, Math.PI * 2, 0, Math.PI / 1.9]} />
                    </mesh>
                    <mesh position={[0, 1.1, -0.05]} material={material}>
                        <sphereGeometry args={[0.28, 14, 14]} />
                    </mesh>
                </group>
            )
        case "mohawk":
            return (
                <mesh position={[0, 0.65, 0]} material={material}>
                    <boxGeometry args={[0.18, 0.55, 1.7]} />
                </mesh>
            )
        case "spike":
            return (
                <group>
                    <mesh position={[0, 0.18, 0]} material={material} scale={[1.04, 1.02, 1.04]}>
                        <sphereGeometry args={[1, 24, 18, 0, Math.PI * 2, 0, Math.PI / 2.4]} />
                    </mesh>
                    {[
                        [-0.4, 0.85, 0.5], [-0.15, 0.95, 0.55], [0.15, 0.95, 0.55],
                        [0.4, 0.85, 0.5], [0, 1.05, 0.2],
                    ].map(([x, y, z], i) => (
                        <mesh key={i} position={[x, y, z]} rotation={[0.3, 0, 0]} material={material}>
                            <coneGeometry args={[0.13, 0.4, 6]} />
                        </mesh>
                    ))}
                </group>
            )
        case "undercut":
            return (
                <mesh position={[0, 0.45, 0]} material={material} scale={[1.05, 0.55, 1.05]}>
                    <sphereGeometry args={[1, 28, 22, 0, Math.PI * 2, 0, Math.PI / 2]} />
                </mesh>
            )
        case "dreads":
            return (
                <group>
                    <mesh position={[0, 0.2, 0]} material={material} scale={[1.06, 1.06, 1.06]}>
                        <sphereGeometry args={[1, 24, 18, 0, Math.PI * 2, 0, Math.PI / 1.9]} />
                    </mesh>
                    {[
                        [-0.7, -0.1], [-0.5, -0.2], [-0.3, -0.25], [0, -0.3],
                        [0.3, -0.25], [0.5, -0.2], [0.7, -0.1],
                    ].map(([x, y], i) => (
                        <mesh key={i} position={[x, y, -0.5]} material={material}>
                            <capsuleGeometry args={[0.08, 0.6, 4, 8]} />
                        </mesh>
                    ))}
                </group>
            )
        case "cap":
            return (
                <group>
                    <mesh position={[0, 0.55, 0]} material={material} scale={[1.05, 0.5, 1.05]}>
                        <sphereGeometry args={[1, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2]} />
                    </mesh>
                    <mesh position={[0, 0.4, 0.85]} rotation={[-0.3, 0, 0]} material={material}>
                        <boxGeometry args={[1.0, 0.08, 0.55]} />
                    </mesh>
                </group>
            )
        case "beanie":
            return (
                <group>
                    <mesh position={[0, 0.55, 0]} material={material} scale={[1.08, 0.8, 1.08]}>
                        <sphereGeometry args={[1, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2]} />
                    </mesh>
                    <mesh position={[0, 1.18, 0]} material={material}>
                        <sphereGeometry args={[0.18, 12, 12]} />
                    </mesh>
                </group>
            )
        case "hoodie":
            return (
                <group>
                    <mesh position={[0, 0.18, 0]} material={material} scale={[1.04, 1.02, 1.04]}>
                        <sphereGeometry args={[1, 24, 18, 0, Math.PI * 2, 0, Math.PI / 2.2]} />
                    </mesh>
                    <mesh position={[0, -0.4, -0.35]} material={material} scale={[1.45, 1.3, 1.0]}>
                        <sphereGeometry args={[1, 18, 14, 0, Math.PI * 2, 0, Math.PI / 1.6]} />
                    </mesh>
                </group>
            )
    }
}

function AccessoryMesh({
    features,
    darkMat,
    accentMat,
}: {
    features: PortraitFeatures
    darkMat: THREE.Material
    accentMat: THREE.Material
}) {
    const acc: Accessory = features.accessory
    switch (acc) {
        case "none":
            return null
        case "headset":
            return (
                <group>
                    {/* Band */}
                    <mesh position={[0, 0.7, 0]} rotation={[0, 0, 0]} material={darkMat}>
                        <torusGeometry args={[1.0, 0.06, 8, 24, Math.PI]} />
                    </mesh>
                    {/* Cups */}
                    <mesh position={[-1.0, 0.05, 0]} material={darkMat}>
                        <cylinderGeometry args={[0.32, 0.32, 0.18, 18]} />
                    </mesh>
                    <mesh position={[1.0, 0.05, 0]} material={darkMat}>
                        <cylinderGeometry args={[0.32, 0.32, 0.18, 18]} />
                    </mesh>
                    {/* Accent rings on cups */}
                    <mesh position={[-1.05, 0.05, 0]} rotation={[0, 0, Math.PI / 2]} material={accentMat}>
                        <torusGeometry args={[0.22, 0.025, 6, 16]} />
                    </mesh>
                    <mesh position={[1.05, 0.05, 0]} rotation={[0, 0, Math.PI / 2]} material={accentMat}>
                        <torusGeometry args={[0.22, 0.025, 6, 16]} />
                    </mesh>
                    {/* Mic boom */}
                    <mesh position={[0.95, -0.4, 0.2]} rotation={[0, 0, -0.4]} material={darkMat}>
                        <cylinderGeometry args={[0.025, 0.025, 0.55, 8]} />
                    </mesh>
                    <mesh position={[0.7, -0.65, 0.45]} material={darkMat}>
                        <sphereGeometry args={[0.06, 10, 10]} />
                    </mesh>
                </group>
            )
        case "glasses":
            return (
                <group position={[0, 0.18, 0.92]}>
                    <mesh position={[-0.32, 0, 0]} material={darkMat}>
                        <torusGeometry args={[0.16, 0.018, 8, 18]} />
                    </mesh>
                    <mesh position={[0.32, 0, 0]} material={darkMat}>
                        <torusGeometry args={[0.16, 0.018, 8, 18]} />
                    </mesh>
                    <mesh position={[0, 0, 0]} material={darkMat}>
                        <boxGeometry args={[0.32, 0.018, 0.018]} />
                    </mesh>
                </group>
            )
        case "sunglasses":
            return (
                <group position={[0, 0.18, 0.93]}>
                    <mesh position={[-0.32, 0, 0]} material={darkMat}>
                        <boxGeometry args={[0.36, 0.18, 0.04]} />
                    </mesh>
                    <mesh position={[0.32, 0, 0]} material={darkMat}>
                        <boxGeometry args={[0.36, 0.18, 0.04]} />
                    </mesh>
                    <mesh position={[0, 0, 0]} material={darkMat}>
                        <boxGeometry args={[0.32, 0.04, 0.03]} />
                    </mesh>
                </group>
            )
        case "headband":
            return (
                <mesh position={[0, 0.45, 0]} rotation={[0, 0, 0]} material={accentMat}>
                    <cylinderGeometry args={[1.04, 1.04, 0.18, 24, 1, true]} />
                </mesh>
            )
        case "earbud":
            return (
                <>
                    <mesh position={[-1.0, -0.05, 0]} material={darkMat}>
                        <sphereGeometry args={[0.1, 12, 12]} />
                    </mesh>
                    <mesh position={[1.0, -0.05, 0]} material={darkMat}>
                        <sphereGeometry args={[0.1, 12, 12]} />
                    </mesh>
                </>
            )
        case "eyepatch":
            return (
                <group position={[-0.32, 0.18, 0.92]}>
                    <mesh material={darkMat}>
                        <boxGeometry args={[0.4, 0.3, 0.04]} />
                    </mesh>
                    <mesh position={[-0.18, 0.05, -0.5]} rotation={[0, 0, 0.4]} material={darkMat}>
                        <boxGeometry args={[1.4, 0.04, 0.02]} />
                    </mesh>
                </group>
            )
    }
}

function AutoRotator({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
    const ref = useRef<THREE.Group>(null)
    useFrame((_, delta) => {
        if (enabled && ref.current) {
            ref.current.rotation.y += delta * 0.35
        }
    })
    return <group ref={ref}>{children}</group>
}

function PortraitScene({
    features,
    autoRotate,
}: {
    features: PortraitFeatures
    autoRotate: boolean
}) {
    return (
        <>
            <color attach="background" args={[features.bg[1]]} />
            <fog attach="fog" args={[features.bg[0], 6, 12]} />

            {/* Three-point lighting. Previously we also dropped in a drei
                <Environment preset="studio" /> here, but that pulls
                studio_small_03_1k.hdr from a remote CDN (raw.githack.com →
                polyhaven). When the user is offline / behind a firewall /
                running the Electron build, the fetch fails and surfaces as
                "Could not load studio_small_03_1k.hdr". The lights below
                already give the portrait a clean studio look, so the HDR
                ambient probe is not worth the network dependency. */}
            <ambientLight intensity={0.7} />
            <directionalLight position={[3, 4, 4]} intensity={1.4} color="#fff7e6" />
            <directionalLight position={[-3, 2, 2]} intensity={0.6} color={features.accent} />
            <directionalLight position={[0, -2, 4]} intensity={0.3} color="#b9e7ff" />
            <hemisphereLight intensity={0.35} color="#dbeafe" groundColor="#1f2937" />

            <AutoRotator enabled={autoRotate}>
                <Head features={features} />
            </AutoRotator>

            <ContactShadows
                position={[0, -1.85, 0]}
                opacity={0.4}
                scale={6}
                blur={2.4}
                far={3}
            />
        </>
    )
}

export function Player3DPortrait({
    seed,
    size = 256,
    className,
    autoRotate = true,
    interactive = true,
}: Player3DPortraitProps) {
    const features = useMemo(() => derivePortraitFeatures(seed), [seed])

    return (
        <div
            className={className}
            style={{ width: size, height: size, position: "relative" }}
        >
            <Canvas
                shadows={false}
                dpr={[1, 2]}
                camera={{ position: [0, 0, 3.4], fov: 32 }}
                gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
            >
                <PortraitScene features={features} autoRotate={autoRotate} />
                {interactive && (
                    <OrbitControls
                        enablePan={false}
                        enableZoom={false}
                        minPolarAngle={Math.PI / 3}
                        maxPolarAngle={Math.PI / 1.7}
                        rotateSpeed={0.5}
                    />
                )}
            </Canvas>
        </div>
    )
}

export default Player3DPortrait
