/* global THREE */
(function () {
	// Scene setup
	const container = document.getElementById('canvas-container');
	const scene = new THREE.Scene();
	scene.background = null;

	const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	container.appendChild(renderer.domElement);

	// Z-up convention
	// We'll keep geometry in default, but ensure controls move along Z for height.

	// Camera: use PerspectiveCamera with setFocalLength support
	const initialFov = 50; // temporary; we'll override with focal length
	const camera = new THREE.PerspectiveCamera(initialFov, 1, 0.01, 2000);
	// Initial transforms
	camera.position.set(0, 6, 2);

	// Define target as a dummy object the camera looksAt
	const target = new THREE.Object3D();
	target.position.set(0, 0, 0);
	scene.add(target);

	// Helpers: grid and axes
	const grid = new THREE.GridHelper(50, 50, 0x334155, 0x1f2937);
	grid.rotation.x = Math.PI / 2; // align grid on X-Y plane with Z up
	scene.add(grid);

	const axes = new THREE.AxesHelper(2);
	scene.add(axes);

	// Cube in center
	const cube = new THREE.Mesh(
		new THREE.BoxGeometry(1, 1, 1),
		new THREE.MeshStandardMaterial({ color: 0x4f46e5, roughness: 0.5, metalness: 0.1 })
	);
	cube.position.set(0, 0, 0.5); // sit on grid (Z up)
	scene.add(cube);

	// Lights
	const hemi = new THREE.HemisphereLight(0xffffff, 0x0b1220, 1.0);
	scene.add(hemi);
	const dir = new THREE.DirectionalLight(0xffffff, 0.8);
	dir.position.set(5, 10, 10);
	scene.add(dir);

	// UI elements
	const lensPreset = document.getElementById('lensPreset');
	const lensCustom = document.getElementById('lensCustom');
	const cameraZ = document.getElementById('cameraZ');
	const cameraZNumber = document.getElementById('cameraZNumber');
	const targetZ = document.getElementById('targetZ');
	const targetZNumber = document.getElementById('targetZNumber');
	const distanceY = document.getElementById('distanceY');
	const distanceYNumber = document.getElementById('distanceYNumber');
	const tiltAngle = document.getElementById('tiltAngle');
	const tiltAngleNumber = document.getElementById('tiltAngleNumber');
	const distanceModeRadios = Array.from(document.querySelectorAll('input[name="distanceMode"]'));
	const distanceYRow = document.getElementById('distanceYRow');
	const tiltRow = document.getElementById('tiltRow');

	const readout = {
		euclidDist: document.getElementById('euclidDist'),
		camX: document.getElementById('camX'),
		camY: document.getElementById('camY'),
		camZ: document.getElementById('camZ'),
		tgtX: document.getElementById('tgtX'),
		tgtY: document.getElementById('tgtY'),
		tgtZ: document.getElementById('tgtZ')
	};

	// Sizing
	function resizeRenderer() {
		const { clientWidth, clientHeight } = container;
		renderer.setSize(clientWidth, clientHeight, false);
		camera.aspect = clientWidth / clientHeight;
		camera.updateProjectionMatrix();
	}
	window.addEventListener('resize', resizeRenderer);
	// Initial size using parent size; if 0, fallback to window
	function ensureContainerSize() {
		if (container.clientWidth === 0 || container.clientHeight === 0) {
			container.style.minHeight = '60vh';
		}
	}
	ensureContainerSize();
	resizeRenderer();

	// Camera focal length helpers
	function setFocalLengthMm(mm) {
		const clamped = Math.max(0.1, Math.min(1000, Number(mm) || 35));
		camera.setFocalLength(clamped);
		camera.updateProjectionMatrix();
	}

	// Distance/Y vs Tilt modes
	function getActiveDistanceMode() {
		const checked = distanceModeRadios.find(r => r.checked);
		return checked ? checked.value : 'y';
	}

	function updateUIVisibility() {
		const mode = getActiveDistanceMode();
		distanceYRow.classList.toggle('hidden', mode !== 'y');
		tiltRow.classList.toggle('hidden', mode !== 'tilt');
	}

	function updateCameraFromControls() {
		const camZ = Number(cameraZ.value);
		const tgtZ = Number(targetZ.value);
		const mode = getActiveDistanceMode();

		// Target stays at origin X=0, Y=0 by default per requirements; only Z changes
		target.position.set(0, 0, tgtZ);

		if (mode === 'y') {
			const distY = Math.max(0.1, Number(distanceY.value));
			camera.position.set(0, distY, camZ);
		} else {
			// Tilt mode: define camera position by tilt angle around target on Y axis plane
			// Angle is measured from horizontal; 0 => horizontal, 90 => vertical down/up (we clamp 1..89)
			const angleDeg = Math.max(1, Math.min(89, Number(tiltAngle.value)));
			const angleRad = angleDeg * Math.PI / 180;
			// Keep a reference horizontal range (radius) on ground from target; reuse distanceY as base radius for simplicity
			const baseRadius = Math.max(0.1, Number(distanceY.value));
			const radiusHorizontal = baseRadius; // projection on XY plane
			const y = radiusHorizontal * Math.cos(angleRad);
			const zOffset = radiusHorizontal * Math.sin(angleRad);
			const z = camZ + zOffset;
			camera.position.set(0, y, z);
		}

		camera.lookAt(target.position);
		updateReadouts();
	}

	function updateReadouts() {
		const dist = camera.position.distanceTo(target.position);
		readout.euclidDist.textContent = dist.toFixed(3);
		readout.camX.textContent = camera.position.x.toFixed(3);
		readout.camY.textContent = camera.position.y.toFixed(3);
		readout.camZ.textContent = camera.position.z.toFixed(3);
		readout.tgtX.textContent = target.position.x.toFixed(3);
		readout.tgtY.textContent = target.position.y.toFixed(3);
		readout.tgtZ.textContent = target.position.z.toFixed(3);
	}

	// Wire events
	// Focal length preset vs custom
	lensPreset.addEventListener('change', () => {
		const val = lensPreset.value;
		if (val) {
			lensCustom.value = val;
		}
		setFocalLengthMm(lensCustom.value);
	});
	['change', 'input'].forEach(evt => {
		lensCustom.addEventListener(evt, () => {
			// When typing custom, clear preset selection
			lensPreset.value = '';
			setFocalLengthMm(lensCustom.value);
		});
	});

	// Camera Z
	['input', 'change'].forEach(evt => {
		cameraZ.addEventListener(evt, () => {
			cameraZNumber.value = cameraZ.value;
			updateCameraFromControls();
		});
		cameraZNumber.addEventListener(evt, () => {
			cameraZ.value = cameraZNumber.value;
			updateCameraFromControls();
		});
	});

	// Target Z
	['input', 'change'].forEach(evt => {
		targetZ.addEventListener(evt, () => {
			targetZNumber.value = targetZ.value;
			updateCameraFromControls();
		});
		targetZNumber.addEventListener(evt, () => {
			targetZ.value = targetZNumber.value;
			updateCameraFromControls();
		});
	});

	// Distance Y
	['input', 'change'].forEach(evt => {
		distanceY.addEventListener(evt, () => {
			distanceYNumber.value = distanceY.value;
			updateCameraFromControls();
		});
		distanceYNumber.addEventListener(evt, () => {
			distanceY.value = distanceYNumber.value;
			updateCameraFromControls();
		});
	});

	// Tilt angle
	['input', 'change'].forEach(evt => {
		tiltAngle.addEventListener(evt, () => {
			tiltAngleNumber.value = tiltAngle.value;
			updateCameraFromControls();
		});
		tiltAngleNumber.addEventListener(evt, () => {
			tiltAngle.value = tiltAngleNumber.value;
			updateCameraFromControls();
		});
	});

	// Mode radios
	distanceModeRadios.forEach(r => {
		r.addEventListener('change', () => {
			updateUIVisibility();
			updateCameraFromControls();
		});
	});

	// Initial values
	setFocalLengthMm(lensCustom.value);
	updateUIVisibility();
	updateCameraFromControls();

	// Render loop
	function animate() {
		renderer.render(scene, camera);
		requestAnimationFrame(animate);
	}
	animate();
})();

