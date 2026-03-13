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
	const viewportModeRadios = Array.from(document.querySelectorAll('input[name="viewportMode"]'));
	const distanceYRow = document.getElementById('distanceYRow');
	const tiltRow = document.getElementById('tiltRow');
	const imageToolControls = document.getElementById('imageToolControls');
	const imageToolViewport = document.getElementById('image-tool-viewport');
	const imageUpload = document.getElementById('imageUpload');
	const pixelsPerUnit = document.getElementById('pixelsPerUnit');
	const unitLabel = document.getElementById('unitLabel');
	const clearMeasurements = document.getElementById('clearMeasurements');
	const dimensionCanvas = document.getElementById('dimensionCanvas');
	const imageToolEmptyState = document.getElementById('imageToolEmptyState');
	const dimensionCtx = dimensionCanvas.getContext('2d');

	const readout = {
		euclidDist: document.getElementById('euclidDist'),
		camX: document.getElementById('camX'),
		camY: document.getElementById('camY'),
		camZ: document.getElementById('camZ'),
		tgtX: document.getElementById('tgtX'),
		tgtY: document.getElementById('tgtY'),
		tgtZ: document.getElementById('tgtZ')
	};

	let activeViewportMode = 'three';
	const imageToolState = {
		image: null,
		drawRect: null,
		measurements: [],
		draft: null
	};

	// Sizing
	function resizeRenderer() {
		const { clientWidth, clientHeight } = container;
		renderer.setSize(clientWidth, clientHeight, false);
		camera.aspect = clientWidth / clientHeight;
		camera.updateProjectionMatrix();
		resizeImageCanvas();
		renderImageTool();
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

	function getActiveViewportMode() {
		const checked = viewportModeRadios.find(r => r.checked);
		return checked ? checked.value : 'three';
	}

	function updateUIVisibility() {
		const mode = getActiveDistanceMode();
		distanceYRow.classList.toggle('hidden', mode !== 'y');
		tiltRow.classList.toggle('hidden', mode !== 'tilt');
	}

	function updateViewportVisibility() {
		activeViewportMode = getActiveViewportMode();
		const imageMode = activeViewportMode === 'image';
		imageToolControls.classList.toggle('hidden', !imageMode);
		imageToolViewport.classList.toggle('hidden', !imageMode);
		renderer.domElement.style.display = imageMode ? 'none' : 'block';
		renderImageTool();
	}

	function resizeImageCanvas() {
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const width = Math.max(1, container.clientWidth);
		const height = Math.max(1, container.clientHeight);
		dimensionCanvas.width = Math.floor(width * dpr);
		dimensionCanvas.height = Math.floor(height * dpr);
		dimensionCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
	}

	function getCanvasPointer(evt) {
		const rect = dimensionCanvas.getBoundingClientRect();
		return {
			x: evt.clientX - rect.left,
			y: evt.clientY - rect.top
		};
	}

	function clamp(value, min, max) {
		return Math.min(max, Math.max(min, value));
	}

	function getPixelsPerUnit() {
		const parsed = Number(pixelsPerUnit.value);
		return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
	}

	function getUnitLabel() {
		const trimmed = (unitLabel.value || '').trim();
		return trimmed || 'px';
	}

	function canvasToImagePoint(point) {
		if (!imageToolState.image || !imageToolState.drawRect) return null;
		const rect = imageToolState.drawRect;
		const img = imageToolState.image;
		const clampedX = clamp(point.x, rect.x, rect.x + rect.width);
		const clampedY = clamp(point.y, rect.y, rect.y + rect.height);
		return {
			x: ((clampedX - rect.x) / rect.width) * img.width,
			y: ((clampedY - rect.y) / rect.height) * img.height
		};
	}

	function imageToCanvasPoint(point) {
		if (!imageToolState.image || !imageToolState.drawRect) return null;
		const rect = imageToolState.drawRect;
		const img = imageToolState.image;
		return {
			x: rect.x + (point.x / img.width) * rect.width,
			y: rect.y + (point.y / img.height) * rect.height
		};
	}

	function drawMeasurementLine(startCanvas, endCanvas, pixelLength) {
		const dx = endCanvas.x - startCanvas.x;
		const dy = endCanvas.y - startCanvas.y;
		const lineLength = Math.hypot(dx, dy);
		if (lineLength < 0.001) return;

		dimensionCtx.strokeStyle = '#38bdf8';
		dimensionCtx.lineWidth = 2;
		dimensionCtx.lineCap = 'round';
		dimensionCtx.beginPath();
		dimensionCtx.moveTo(startCanvas.x, startCanvas.y);
		dimensionCtx.lineTo(endCanvas.x, endCanvas.y);
		dimensionCtx.stroke();

		dimensionCtx.fillStyle = '#22d3ee';
		dimensionCtx.beginPath();
		dimensionCtx.arc(startCanvas.x, startCanvas.y, 3, 0, Math.PI * 2);
		dimensionCtx.arc(endCanvas.x, endCanvas.y, 3, 0, Math.PI * 2);
		dimensionCtx.fill();

		const midpoint = { x: (startCanvas.x + endCanvas.x) / 2, y: (startCanvas.y + endCanvas.y) / 2 };
		const units = pixelLength / getPixelsPerUnit();
		const labelText = `${units.toFixed(2)} ${getUnitLabel()}`;
		dimensionCtx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
		const textWidth = dimensionCtx.measureText(labelText).width;
		const pad = 6;
		const normal = { x: -dy / lineLength, y: dx / lineLength };
		const labelX = midpoint.x + normal.x * 14;
		const labelY = midpoint.y + normal.y * 14;

		dimensionCtx.fillStyle = 'rgba(2, 6, 23, 0.85)';
		dimensionCtx.fillRect(labelX - textWidth / 2 - pad, labelY - 11, textWidth + pad * 2, 18);
		dimensionCtx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
		dimensionCtx.lineWidth = 1;
		dimensionCtx.strokeRect(labelX - textWidth / 2 - pad, labelY - 11, textWidth + pad * 2, 18);

		dimensionCtx.fillStyle = '#e0f2fe';
		dimensionCtx.fillText(labelText, labelX - textWidth / 2, labelY + 2);
	}

	function renderImageTool() {
		const width = Math.max(1, container.clientWidth);
		const height = Math.max(1, container.clientHeight);
		dimensionCtx.clearRect(0, 0, width, height);

		if (!imageToolState.image) {
			imageToolState.drawRect = null;
			imageToolEmptyState.classList.toggle('hidden', activeViewportMode !== 'image');
			return;
		}

		imageToolEmptyState.classList.add('hidden');
		const img = imageToolState.image;
		const scale = Math.min(width / img.width, height / img.height);
		const drawWidth = img.width * scale;
		const drawHeight = img.height * scale;
		const drawX = (width - drawWidth) / 2;
		const drawY = (height - drawHeight) / 2;
		imageToolState.drawRect = { x: drawX, y: drawY, width: drawWidth, height: drawHeight };

		dimensionCtx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
		imageToolState.measurements.forEach(entry => {
			const startCanvas = imageToCanvasPoint(entry.start);
			const endCanvas = imageToCanvasPoint(entry.end);
			drawMeasurementLine(startCanvas, endCanvas, entry.pixelLength);
		});

		if (imageToolState.draft) {
			const startCanvas = imageToCanvasPoint(imageToolState.draft.start);
			const endCanvas = imageToCanvasPoint(imageToolState.draft.end);
			const dx = imageToolState.draft.end.x - imageToolState.draft.start.x;
			const dy = imageToolState.draft.end.y - imageToolState.draft.start.y;
			const pixelLength = Math.hypot(dx, dy);
			drawMeasurementLine(startCanvas, endCanvas, pixelLength);
		}
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

	// Viewport mode radios
	viewportModeRadios.forEach(radio => {
		radio.addEventListener('change', updateViewportVisibility);
	});

	imageUpload.addEventListener('change', () => {
		const [file] = imageUpload.files || [];
		if (!file) return;
		const fileReader = new FileReader();
		fileReader.onload = event => {
			const loaded = new Image();
			loaded.onload = () => {
				imageToolState.image = loaded;
				imageToolState.measurements = [];
				imageToolState.draft = null;
				renderImageTool();
			};
			loaded.src = String(event.target?.result || '');
		};
		fileReader.readAsDataURL(file);
	});

	function updateDraftMeasurement(evt) {
		if (!imageToolState.draft) return;
		const pointer = getCanvasPointer(evt);
		const asImagePoint = canvasToImagePoint(pointer);
		if (!asImagePoint) return;
		imageToolState.draft.end = asImagePoint;
		renderImageTool();
	}

	dimensionCanvas.addEventListener('pointerdown', evt => {
		if (!imageToolState.image || activeViewportMode !== 'image') return;
		const pointer = getCanvasPointer(evt);
		if (!imageToolState.drawRect) return;
		const rect = imageToolState.drawRect;
		const inside = pointer.x >= rect.x && pointer.x <= rect.x + rect.width && pointer.y >= rect.y && pointer.y <= rect.y + rect.height;
		if (!inside) return;
		const start = canvasToImagePoint(pointer);
		if (!start) return;
		imageToolState.draft = { start, end: start };
		dimensionCanvas.setPointerCapture(evt.pointerId);
		renderImageTool();
	});

	dimensionCanvas.addEventListener('pointermove', updateDraftMeasurement);
	dimensionCanvas.addEventListener('pointerup', evt => {
		if (!imageToolState.draft) return;
		updateDraftMeasurement(evt);
		const draft = imageToolState.draft;
		const dx = draft.end.x - draft.start.x;
		const dy = draft.end.y - draft.start.y;
		const pixelLength = Math.hypot(dx, dy);
		if (pixelLength >= 1) {
			imageToolState.measurements.push({ start: draft.start, end: draft.end, pixelLength });
		}
		imageToolState.draft = null;
		renderImageTool();
	});
	dimensionCanvas.addEventListener('pointercancel', () => {
		imageToolState.draft = null;
		renderImageTool();
	});

	[pixelsPerUnit, unitLabel].forEach(input => {
		['input', 'change'].forEach(evt => input.addEventListener(evt, renderImageTool));
	});

	clearMeasurements.addEventListener('click', () => {
		imageToolState.measurements = [];
		imageToolState.draft = null;
		renderImageTool();
	});

	// Initial values
	setFocalLengthMm(lensCustom.value);
	updateUIVisibility();
	updateViewportVisibility();
	updateCameraFromControls();

	// Render loop
	function animate() {
		if (activeViewportMode === 'three') {
			renderer.render(scene, camera);
		}
		requestAnimationFrame(animate);
	}
	animate();
})();

