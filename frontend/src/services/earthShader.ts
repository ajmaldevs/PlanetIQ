import * as THREE from 'three';

export interface EarthDayNightShaderBundle {
  earthMaterial: THREE.ShaderMaterial;
  atmosphereMaterial: THREE.ShaderMaterial;
  updateSun: (sunDirection: THREE.Vector3) => void;
  dispose: () => void;
}

/**
 * Creates a physically-inspired Earth Day/Night Shader and Rayleigh Atmospheric Limb
 */
export function createEarthDayNightShader(
  dayTexture: THREE.Texture,
  nightTexture: THREE.Texture,
  normalTexture: THREE.Texture,
  specularTexture: THREE.Texture
): EarthDayNightShaderBundle {
  const sunDirUniform = { value: new THREE.Vector3(1.0, 0.4, 0.8).normalize() };

  // 1. Earth Surface Shader: Day/Night Blend + Ocean Specular Glint + City Night Lights
  const earthMaterial = new THREE.ShaderMaterial({
    uniforms: {
      dayMap: { value: dayTexture },
      nightMap: { value: nightTexture },
      normalMap: { value: normalTexture },
      specularMap: { value: specularTexture },
      sunDirection: sunDirUniform,
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;

      uniform sampler2D dayMap;
      uniform sampler2D nightMap;
      uniform sampler2D normalMap;
      uniform sampler2D specularMap;
      uniform vec3 sunDirection;

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 sunDir = normalize(sunDirection);
        vec3 viewDir = normalize(vViewPosition);

        // Dot product between surface normal and sun direction
        float NdotL = dot(normal, sunDir);

        // Smooth physical twilight transition across the day-night terminator
        float dayFactor = smoothstep(-0.18, 0.20, NdotL);

        // Sample textures
        vec4 dayColor = texture2D(dayMap, vUv);
        vec4 nightColor = texture2D(nightMap, vUv);
        float specularIntensity = texture2D(specularMap, vUv).r;

        // Specular sun glint on water (oceans produce natural sun reflection)
        vec3 halfDir = normalize(sunDir + viewDir);
        float specHighlight = pow(max(0.0, dot(normal, halfDir)), 32.0) * specularIntensity * 1.6;

        // Night side city lights: warm amber/golden glow on dark landmasses
        vec3 nightLights = nightColor.rgb * (1.0 - dayFactor) * 1.75;

        // Space ambient earthshine: subtle dark navy/indigo fill on dark hemisphere
        vec3 spaceAmbient = vec3(0.015, 0.022, 0.040) * dayColor.rgb;

        // Daylight surface with natural sunlight illumination and specular reflection
        vec3 litDay = dayColor.rgb * (max(0.06, dayFactor) * 1.25) + vec3(specHighlight * dayFactor);

        // Final composite surface color
        vec3 finalColor = litDay + nightLights + spaceAmbient;

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
  });

  // 2. Realistic Rayleigh Atmospheric Limb (Illuminated on sunlit side, twilight warm edge, dark on shadow side)
  const atmosphereMaterial = new THREE.ShaderMaterial({
    uniforms: {
      sunDirection: sunDirUniform,
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec3 vWorldPosition;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec3 vWorldPosition;
      uniform vec3 sunDirection;

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        vec3 sunDir = normalize(sunDirection);

        // Grazing view angle edge factor
        float edge = pow(1.0 - max(0.0, dot(normal, viewDir)), 5.2);

        // Sun angle factor: atmospheric scattering is prominent on the sunlit hemisphere
        float sunDot = dot(normal, sunDir);
        float sunLit = smoothstep(-0.25, 0.45, sunDot);

        // Colors: cyan-blue daytime scattering + sunset warm twilight along the terminator
        vec3 blueSky = vec3(0.38, 0.68, 0.98);
        vec3 sunsetGlow = vec3(0.95, 0.48, 0.20);

        // Blend sunset glow along the terminator (-0.1 to +0.2)
        float twilight = smoothstep(-0.25, 0.0, sunDot) * (1.0 - smoothstep(0.0, 0.35, sunDot));
        vec3 atmosColor = mix(blueSky, sunsetGlow, twilight * 0.65);

        float alpha = edge * sunLit * 0.38;
        gl_FragColor = vec4(atmosColor, alpha);
      }
    `,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  });

  const updateSun = (sunDirection: THREE.Vector3) => {
    sunDirUniform.value.copy(sunDirection).normalize();
  };

  const dispose = () => {
    earthMaterial.dispose();
    atmosphereMaterial.dispose();
  };

  return {
    earthMaterial,
    atmosphereMaterial,
    updateSun,
    dispose,
  };
}
