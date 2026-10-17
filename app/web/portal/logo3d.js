/* Logo del portal: excavadora 970 en 3D dibujada como plano técnico azul, girando. */
(() => {
  const lienzo = document.getElementById('logo3d');
  if (!lienzo || !window.THREE) return;
  const renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(56, 56, false);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(6.6, 4.4, 6.6); camera.lookAt(0, 0.8, 0);

  const linea = new THREE.LineBasicMaterial({ color: 0xBFD6FF });
  const tenue = new THREE.LineBasicMaterial({ color: 0x6E9BFF, transparent: true, opacity: 0.55 });
  const pieza = (geo, x, y, z, padre, mat = linea, rx = 0) => {
    const l = new THREE.LineSegments(new THREE.EdgesGeometry(geo), mat);
    l.position.set(x, y, z); l.rotation.x = rx; padre.add(l); return l;
  };
  const caja = (w, h, d, x, y, z, padre, mat, rx) => pieza(new THREE.BoxGeometry(w, h, d), x, y, z, padre, mat, rx);

  const maquina = new THREE.Group(); scene.add(maquina);
  // Orugas con rodillos
  [-0.72, 0.72].forEach(x => {
    caja(0.42, 0.42, 2.5, x, 0.28, 0, maquina);
    [-1.1, -0.55, 0, 0.55, 1.1].forEach(z => {
      const r = pieza(new THREE.CylinderGeometry(0.15, 0.15, 0.44, 10), x, 0.28, z, maquina, tenue);
      r.rotation.z = Math.PI / 2;
    });
  });
  // Torreta, contrapeso, motor y cabina
  const torreta = new THREE.Group(); torreta.position.y = 0.63; maquina.add(torreta);
  caja(1.62, 0.2, 2.15, 0, 0.08, 0.05, torreta, tenue);
  caja(1.55, 0.5, 1.35, 0.05, 0.42, 0.42, torreta);
  caja(1.58, 0.42, 0.32, 0.05, 0.38, 1.18, torreta);
  caja(1.0, 0.18, 0.9, 0.2, 0.76, 0.48, torreta, tenue);
  caja(0.6, 0.62, 0.72, -0.48, 0.5, -0.55, torreta);
  // Pluma, brazo y pala
  const pluma = new THREE.Group(); pluma.position.set(0.18, 0.55, -0.72); torreta.add(pluma);
  caja(0.24, 0.3, 1.5, 0, 0.55, -0.55, pluma, linea, 0.85);
  caja(0.22, 0.28, 1.1, 0, 1.0, -1.55, pluma, linea, -0.35);
  const brazo = new THREE.Group(); brazo.position.set(0, 1.18, -2.05); pluma.add(brazo);
  caja(0.2, 1.25, 0.24, 0, -0.55, 0, brazo);
  caja(0.42, 0.34, 0.46, 0, -1.3, -0.22, brazo, tenue);

  maquina.position.set(0, 0, 0.35);
  const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let visible = true;
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; });
  (function girar(t) {
    if (visible) {
      maquina.rotation.y = reducido ? 0.7 : t * 0.0006;
      pluma.rotation.x = reducido ? 0 : Math.sin(t * 0.0012) * 0.18;
      renderer.render(scene, camera);
    }
    if (!reducido) requestAnimationFrame(girar);
  })(0);
})();
