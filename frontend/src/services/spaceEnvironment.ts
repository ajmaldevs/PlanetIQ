import * as THREE from 'three';

/**
 * Creates an authentic, cinematic space environment with:
 * 1. Deep cosmic celestial sphere with subtle faint nebular dust filaments.
 * 2. Multi-tier starfield with natural stellar temperatures (O, B, A, F, G, K, M classes) and variable sizes.
 * 3. Prominent navigational stars with soft twinkle.
 */
export interface SpaceEnvironment {
  group: THREE.Group;
  update: (delta: number, timestamp: number) => void;
  dispose: () => void;
}

export function createCinematicSpaceEnvironment(): SpaceEnvironment {
  const group = new THREE.Group();
  group.name = 'cinematic-space-environment';

  // 1. Deep Celestial Background Sky Dome with Faint Cosmic Dust
  const celestialGeom = new THREE.SphereGeometry(450, 48, 32);
  const celestialMat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vWorldPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPosition;
      uniform float time;

      // Restrained procedural noise for faint cosmic dust filaments
      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      float noise(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }

      void main() {
        vec3 dir = normalize(vWorldPosition);

        // Deep space palette: pure midnight navy base
        vec3 deepCosmos = vec3(0.012, 0.020, 0.038); // #03050a
        vec3 midIndigo   = vec3(0.020, 0.035, 0.070); // #050912
        vec3 dustCyan    = vec3(0.025, 0.065, 0.105); // #06101b faint cyan filament
        vec3 dustViolet  = vec3(0.045, 0.030, 0.085); // #0b0716 faint violet filament

        // Subtle gradient across sky dome
        float verticalGrad = (dir.y + 1.0) * 0.5;
        vec3 base = mix(deepCosmos, midIndigo, verticalGrad * 0.4);

        // Multi-frequency low-contrast nebular dust clouds (extremely subtle, 0.08 opacity)
        float n1 = noise(dir * 3.5 + vec3(0.2, 0.1, 0.0));
        float n2 = noise(dir * 7.0 - vec3(0.1, 0.3, 0.2));
        float dustMask = smoothstep(0.48, 0.82, (n1 * 0.65 + n2 * 0.35));

        vec3 dustColor = mix(dustCyan, dustViolet, n2);
        vec3 finalSpace = mix(base, base + dustColor * 0.35, dustMask * 0.28);

        gl_FragColor = vec4(finalSpace, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  });

  const celestialSphere = new THREE.Mesh(celestialGeom, celestialMat);
  group.add(celestialSphere);

  // 2. Layer 1: Deep Cosmic Starfield (3,200 stars with authentic stellar classification)
  const starCount = 3200;
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  const starSizes = new Float32Array(starCount);

  // Realistic stellar temperature colors (RGB)
  const stellarClasses = [
    new THREE.Color(0.70, 0.82, 1.00), // Class O/B: Cool blue-white (25%)
    new THREE.Color(0.97, 0.98, 1.00), // Class A/F: Pure diamond white (40%)
    new THREE.Color(1.00, 0.95, 0.88), // Class G: Solar warm white (20%)
    new THREE.Color(1.00, 0.80, 0.62), // Class K/M: Warm amber/orange (15%)
  ];

  for (let i = 0; i < starCount; i++) {
    // Distribute evenly on spherical shell (radius 180 to 320)
    const radius = 180 + Math.random() * 140;
    const u = Math.random();
    const v = Math.random();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    const sinPhi = Math.sin(phi);

    starPositions[i * 3] = radius * sinPhi * Math.cos(theta);
    starPositions[i * 3 + 1] = radius * sinPhi * Math.sin(theta);
    starPositions[i * 3 + 2] = radius * Math.cos(phi);

    // Pick spectral class based on population distribution
    const r = Math.random();
    let col = stellarClasses[1];
    if (r < 0.25) col = stellarClasses[0];
    else if (r < 0.65) col = stellarClasses[1];
    else if (r < 0.85) col = stellarClasses[2];
    else col = stellarClasses[3];

    // Slight random intensity variation
    const brightness = 0.40 + Math.random() * 0.55;
    starColors[i * 3] = col.r * brightness;
    starColors[i * 3 + 1] = col.g * brightness;
    starColors[i * 3 + 2] = col.b * brightness;

    // Small, realistic point sizes (0.8px - 1.6px)
    starSizes[i] = 0.8 + Math.random() * 0.8;
  }

  const starGeom = new THREE.BufferGeometry();
  starGeom.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeom.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

  const starMat = new THREE.PointsMaterial({
    size: 1.1,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    sizeAttenuation: false,
  });

  const stars = new THREE.Points(starGeom, starMat);
  group.add(stars);

  // 3. Layer 2: Prominent Navigational Stars (180 bright stars with subtle twinkle)
  const navCount = 180;
  const navPositions = new Float32Array(navCount * 3);
  const navColors = new Float32Array(navCount * 3);

  for (let i = 0; i < navCount; i++) {
    const radius = 140 + Math.random() * 80;
    const u = Math.random();
    const v = Math.random();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    const sinPhi = Math.sin(phi);

    navPositions[i * 3] = radius * sinPhi * Math.cos(theta);
    navPositions[i * 3 + 1] = radius * sinPhi * Math.sin(theta);
    navPositions[i * 3 + 2] = radius * Math.cos(phi);

    // Prominent stars are bright white or brilliant cyan-blue
    const isBlue = Math.random() < 0.4;
    const col = isBlue ? new THREE.Color(0.80, 0.90, 1.0) : new THREE.Color(1.0, 0.98, 0.95);
    navColors[i * 3] = col.r;
    navColors[i * 3 + 1] = col.g;
    navColors[i * 3 + 2] = col.b;
  }

  const navGeom = new THREE.BufferGeometry();
  navGeom.setAttribute('position', new THREE.BufferAttribute(navPositions, 3));
  navGeom.setAttribute('color', new THREE.BufferAttribute(navColors, 3));

  const navMat = new THREE.PointsMaterial({
    size: 2.2,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    sizeAttenuation: false,
  });

  const navStars = new THREE.Points(navGeom, navMat);
  group.add(navStars);

  const update = (_delta: number, timestamp: number) => {
    celestialMat.uniforms.time.value = timestamp * 0.0001;
    // Slow majestic twinkle on prominent navigational stars
    navMat.opacity = 0.85 + Math.sin(timestamp * 0.002) * 0.12;
  };

  const dispose = () => {
    celestialGeom.dispose();
    celestialMat.dispose();
    starGeom.dispose();
    starMat.dispose();
    navGeom.dispose();
    navMat.dispose();
    group.clear();
  };

  return {
    group,
    update,
    dispose,
  };
}
