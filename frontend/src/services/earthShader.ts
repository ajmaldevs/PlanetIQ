import * as THREE from 'three';

export interface EarthDayNightShaderBundle {
  earthMaterial: THREE.ShaderMaterial;
  atmosphereMaterial: THREE.ShaderMaterial;
  updateSun: (sunDirection: THREE.Vector3) => void;
  dispose: () => void;
}

/**
 * Creates a physically-inspired Earth Day/Night Shader and Rayleigh Atmospheric Limb
 * where surface normals, camera vectors, and sun vectors are strictly computed in WORLD space.
 */
export function createEarthDayNightShader(
  dayTexture: THREE.Texture,
  nightTexture: THREE.Texture,
  normalTexture: THREE.Texture,
  specularTexture: THREE.Texture
): EarthDayNightShaderBundle {
  const sunDirUniform = { value: new THREE.Vector3(6.5, 2.8, 5.0).normalize() };

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
      varying vec3 vWorldNormal;
      varying vec2 vUv;
      varying vec3 vWorldPosition;

      void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        // True world-space normal incorporating Earth orientation and rotation
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldNormal;
      varying vec2 vUv;
      varying vec3 vWorldPosition;

      uniform sampler2D dayMap;
      uniform sampler2D nightMap;
      uniform sampler2D normalMap;
      uniform sampler2D specularMap;
      uniform vec3 sunDirection;

      void main() {
        vec3 worldNormal = normalize(vWorldNormal);
        vec3 sunDir = normalize(sunDirection);
        vec3 worldViewDir = normalize(cameraPosition - vWorldPosition);

        // Dot product between surface normal and sunlight direction in unified WORLD space
        float NdotL = dot(worldNormal, sunDir);

        // Smooth physical twilight transition across the day-night terminator (-0.16 to +0.18)
        float dayFactor = smoothstep(-0.16, 0.18, NdotL);

        // Sample day and night surface textures
        vec4 dayColor = texture2D(dayMap, vUv);
        vec4 nightColor = texture2D(nightMap, vUv);
        float specularIntensity = texture2D(specularMap, vUv).r;

        // Specular sun glint on water (oceans produce natural sunlight glint in world space)
        vec3 halfDir = normalize(sunDir + worldViewDir);
        float specHighlight = pow(max(0.0, dot(worldNormal, halfDir)), 32.0) * specularIntensity * 1.5;

        // Night side city lights: warm amber/golden glow on dark landmasses
        vec3 nightLights = nightColor.rgb * (1.0 - dayFactor) * 1.70;

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
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      uniform vec3 sunDirection;

      void main() {
        vec3 worldNormal = normalize(vWorldNormal);
        vec3 worldViewDir = normalize(cameraPosition - vWorldPosition);
        vec3 sunDir = normalize(sunDirection);

        // Grazing view angle edge factor in true world space
        float edge = pow(1.0 - max(0.0, dot(worldNormal, worldViewDir)), 5.2);

        // Sun angle factor: atmospheric scattering is prominent on the sunlit hemisphere
        float sunDot = dot(worldNormal, sunDir);
        float sunLit = smoothstep(-0.25, 0.45, sunDot);

        // Colors: cyan-blue daytime scattering + sunset warm twilight along the terminator
        vec3 blueSky = vec3(0.38, 0.68, 0.98);
        vec3 sunsetGlow = vec3(0.95, 0.48, 0.20);

        // Blend sunset glow along the terminator (-0.25 to +0.35)
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
