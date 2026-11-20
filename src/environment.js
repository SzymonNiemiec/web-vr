export const ENVIRONMENT_COLORS = {
  skyTop: '#4f9ce8',
  skyMiddle: '#a9d7ff',
  skyBottom: '#dff1ff',
  grassBase: '#3f6f35',
  grassBlade: '#6f9f55',
  path: '#b8b0a2'
};

export function getPathSegments() {
  return [];
}

// An understated horizon gives a visitor a sense of orientation through the
// unglazed openings. It depicts no site-specific landscape or neighbouring lots.
export function createWalkEnvironment(THREE) {
  const group = new THREE.Group();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(140,32,16), new THREE.ShaderMaterial({
    side:THREE.BackSide, depthWrite:false,
    uniforms:{
      zenith:{value:new THREE.Color(ENVIRONMENT_COLORS.skyTop).lerp(new THREE.Color('#c8d1cb'),.47)},
      horizon:{value:new THREE.Color(ENVIRONMENT_COLORS.skyBottom).lerp(new THREE.Color('#e4e8de'),.8)}
    },
    vertexShader:`varying float altitude;
      void main(){ altitude=normalize(position).y; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader:`uniform vec3 zenith,horizon; varying float altitude;
      void main(){ gl_FragColor=vec4(mix(horizon,zenith,smoothstep(-.04,.60,altitude)),1.);
      #include <colorspace_fragment>
      }`
  }));
  const land = new THREE.Mesh(new THREE.PlaneGeometry(200,200), new THREE.MeshStandardMaterial({
    color:new THREE.Color(ENVIRONMENT_COLORS.grassBase).lerp(new THREE.Color('#bac0ab'),.75), roughness:1
  }));
  land.rotation.x = -Math.PI/2;
  land.position.y = -.025;
  group.add(sky,land);
  group.visible = false;
  return group;
}
