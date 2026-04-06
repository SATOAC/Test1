/* global THREE */
(function () {
	const container = document.getElementById('canvas-container');
	const scene = new THREE.Scene();
	scene.background = null;

	const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	container.appendChild(renderer.domElement);

	const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 2000);
	camera.position.set(0, 6, 2);

	const target = new THREE.Object3D();
	target.position.set(0, 0, 0);
	scene.add(target);

	const grid = new THREE.GridHelper(50, 50, 0x334155, 0x1f2937);
	grid.rotation.x = Math.PI / 2;
	scene.add(grid);

	const axes = new THREE.AxesHelper(2);
	scene.add(axes);

	const modelPivot = new THREE.Group();
	scene.add(modelPivot);
	let activeModel = null;

	const hemi = new THREE.HemisphereLight(0xffffff, 0x0b1220, 1.0);
	scene.add(hemi);
	const dir = new THREE.DirectionalLight(0xffffff, 0.8);
	dir.position.set(5, 10, 10);
	scene.add(dir);

	const gltfLoader = new THREE.GLTFLoader();
	const objLoader = new THREE.OBJLoader();

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

	const modelInput = document.getElementById('modelInput');
	const modelStatus = document.getElementById('modelStatus');
	const rotateX = document.getElementById('rotateX');
	const rotateXNumber = document.getElementById('rotateXNumber');
	const rotateY = document.getElementById('rotateY');
	const rotateYNumber = document.getElementById('rotateYNumber');
	const rotateZ = document.getElementById('rotateZ');
	const rotateZNumber = document.getElementById('rotateZNumber');
	const resetRotation = document.getElementById('resetRotation');

	const readout = {
		euclidDist: document.getElementById('euclidDist'),
		camX: document.getElementById('camX'),
		camY: document.getElementById('camY'),
		camZ: document.getElementById('camZ'),
		tgtX: document.getElementById('tgtX'),
		tgtY: document.getElementById('tgtY'),
		tgtZ: document.getElementById('tgtZ')
	};

	function resizeRenderer() {
		const { clientWidth, clientHeight } = container;
		renderer.setSize(clientWidth, clientHeight, false);
		camera.aspect = clientWidth / clientHeight;
		camera.updateProjectionMatrix();
	}

	window.addEventListener('resize', resizeRenderer);

	function ensureContainerSize() {
		if (container.clientWidth === 0 || container.clientHeight === 0) {
			container.style.minHeight = '60vh';
		}
	}

	ensureContainerSize();
	resizeRenderer();

	function setFocalLengthMm(mm) {
		const clamped = Math.max(0.1, Math.min(1000, Number(mm) || 35));
		camera.setFocalLength(clamped);
		camera.updateProjectionMatrix();
	}

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

		target.position.set(0, 0, tgtZ);

		if (mode === 'y') {
			const distY = Math.max(0.1, Number(distanceY.value));
			camera.position.set(0, distY, camZ);
		} else {
			const angleDeg = Math.max(1, Math.min(89, Number(tiltAngle.value)));
			const angleRad = angleDeg * Math.PI / 180;
			const baseRadius = Math.max(0.1, Number(distanceY.value));
			const y = baseRadius * Math.cos(angleRad);
			const z = camZ + baseRadius * Math.sin(angleRad);
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

	function createDefaultModel() {
		const mesh = new THREE.Mesh(
			new THREE.BoxGeometry(1, 1, 1),
			new THREE.MeshStandardMaterial({ color: 0x4f46e5, roughness: 0.5, metalness: 0.1 })
		);
		mesh.position.set(0, 0, 0.5);
		return mesh;
	}

	function disposeObject(object) {
		object.traverse(node => {
			if (node.isMesh) {
				if (node.geometry) {
					node.geometry.dispose();
				}
				if (Array.isArray(node.material)) {
					node.material.forEach(material => material && material.dispose && material.dispose());
				} else if (node.material && node.material.dispose) {
					node.material.dispose();
				}
			}
		});
	}

	function normalizeAndGroundModel(model) {
		model.updateMatrixWorld(true);
		const initialBounds = new THREE.Box3().setFromObject(model);
		if (initialBounds.isEmpty()) {
			return;
		}

		const center = initialBounds.getCenter(new THREE.Vector3());
		const size = initialBounds.getSize(new THREE.Vector3());
		const maxAxis = Math.max(size.x, size.y, size.z) || 1;
		const targetSize = 2.5;
		const scale = targetSize / maxAxis;

		model.position.sub(center);
		model.scale.multiplyScalar(scale);
		model.updateMatrixWorld(true);

		const groundedBounds = new THREE.Box3().setFromObject(model);
		model.position.z -= groundedBounds.min.z;
		model.updateMatrixWorld(true);
	}

	function setActiveModel(model) {
		if (activeModel) {
			modelPivot.remove(activeModel);
			disposeObject(activeModel);
		}
		activeModel = model;
		normalizeAndGroundModel(activeModel);
		modelPivot.add(activeModel);
	}

	function setModelStatus(text) {
		modelStatus.textContent = text;
	}

	function wrapDegrees(degrees) {
		return ((degrees + 180) % 360 + 360) % 360 - 180;
	}

	function syncRotationInputsFromModel() {
		const x = wrapDegrees(THREE.MathUtils.radToDeg(modelPivot.rotation.x));
		const y = wrapDegrees(THREE.MathUtils.radToDeg(modelPivot.rotation.y));
		const z = wrapDegrees(THREE.MathUtils.radToDeg(modelPivot.rotation.z));
		rotateX.value = x.toFixed(1);
		rotateXNumber.value = x.toFixed(1);
		rotateY.value = y.toFixed(1);
		rotateYNumber.value = y.toFixed(1);
		rotateZ.value = z.toFixed(1);
		rotateZNumber.value = z.toFixed(1);
	}

	function applyRotationFromInputs() {
		const x = THREE.MathUtils.degToRad(Number(rotateX.value) || 0);
		const y = THREE.MathUtils.degToRad(Number(rotateY.value) || 0);
		const z = THREE.MathUtils.degToRad(Number(rotateZ.value) || 0);
		modelPivot.rotation.set(x, y, z);
	}

	function bindRangeNumberPair(range, numberField, onChange) {
		['input', 'change'].forEach(eventName => {
			range.addEventListener(eventName, () => {
				numberField.value = range.value;
				onChange();
			});
			numberField.addEventListener(eventName, () => {
				range.value = numberField.value;
				onChange();
			});
		});
	}

	function getFileExtension(filename) {
		const idx = filename.lastIndexOf('.');
		return idx === -1 ? '' : filename.slice(idx + 1).toLowerCase();
	}

	function getPrimaryModelFile(files) {
		const byPriority = ['glb', 'gltf', 'obj'];
		for (const ext of byPriority) {
			const found = files.find(file => getFileExtension(file.name) === ext);
			if (found) {
				return found;
			}
		}
		return null;
	}

	function loadGlb(file) {
		return new Promise((resolve, reject) => {
			const url = URL.createObjectURL(file);
			gltfLoader.load(
				url,
				gltf => {
					URL.revokeObjectURL(url);
					resolve(gltf.scene || (gltf.scenes && gltf.scenes[0]));
				},
				undefined,
				error => {
					URL.revokeObjectURL(url);
					reject(error);
				}
			);
		});
	}

	function loadObj(file) {
		return new Promise((resolve, reject) => {
			const url = URL.createObjectURL(file);
			objLoader.load(
				url,
				object => {
					URL.revokeObjectURL(url);
					resolve(object);
				},
				undefined,
				error => {
					URL.revokeObjectURL(url);
					reject(error);
				}
			);
		});
	}

	function loadGltfWithAssets(files, gltfFile) {
		const fileMap = new Map(files.map(file => [file.name, file]));
		const temporaryUrls = [];
		const manager = new THREE.LoadingManager();
		manager.setURLModifier(url => {
			const normalizedName = decodeURIComponent(url).split('/').pop();
			const mappedFile = fileMap.get(normalizedName) || fileMap.get(url);
			if (!mappedFile) {
				return url;
			}
			const mappedUrl = URL.createObjectURL(mappedFile);
			temporaryUrls.push(mappedUrl);
			return mappedUrl;
		});

		const localLoader = new THREE.GLTFLoader(manager);
		return new Promise((resolve, reject) => {
			const sceneUrl = URL.createObjectURL(gltfFile);
			temporaryUrls.push(sceneUrl);
			localLoader.load(
				sceneUrl,
				gltf => {
					temporaryUrls.forEach(url => URL.revokeObjectURL(url));
					resolve(gltf.scene || (gltf.scenes && gltf.scenes[0]));
				},
				undefined,
				error => {
					temporaryUrls.forEach(url => URL.revokeObjectURL(url));
					reject(error);
				}
			);
		});
	}

	async function handleModelUpload() {
		const files = Array.from(modelInput.files || []);
		if (!files.length) {
			return;
		}

		const modelFile = getPrimaryModelFile(files);
		if (!modelFile) {
			setModelStatus('Unsupported file. Use .glb, .gltf, or .obj.');
			return;
		}

		const extension = getFileExtension(modelFile.name);
		setModelStatus(`Loading ${modelFile.name}...`);

		try {
			let loaded = null;
			if (extension === 'glb') {
				loaded = await loadGlb(modelFile);
			} else if (extension === 'gltf') {
				loaded = await loadGltfWithAssets(files, modelFile);
			} else if (extension === 'obj') {
				loaded = await loadObj(modelFile);
			}

			if (!loaded) {
				throw new Error('Could not parse model content.');
			}

			const wrappedModel = new THREE.Group();
			wrappedModel.add(loaded);
			setActiveModel(wrappedModel);
			setModelStatus(`Loaded ${modelFile.name}`);
		} catch (error) {
			console.error(error);
			setModelStatus(`Failed to load ${modelFile.name}`);
		}
	}

	lensPreset.addEventListener('change', () => {
		const value = lensPreset.value;
		if (value) {
			lensCustom.value = value;
		}
		setFocalLengthMm(lensCustom.value);
	});

	['change', 'input'].forEach(eventName => {
		lensCustom.addEventListener(eventName, () => {
			lensPreset.value = '';
			setFocalLengthMm(lensCustom.value);
		});
	});

	bindRangeNumberPair(cameraZ, cameraZNumber, updateCameraFromControls);
	bindRangeNumberPair(targetZ, targetZNumber, updateCameraFromControls);
	bindRangeNumberPair(distanceY, distanceYNumber, updateCameraFromControls);
	bindRangeNumberPair(tiltAngle, tiltAngleNumber, updateCameraFromControls);

	bindRangeNumberPair(rotateX, rotateXNumber, applyRotationFromInputs);
	bindRangeNumberPair(rotateY, rotateYNumber, applyRotationFromInputs);
	bindRangeNumberPair(rotateZ, rotateZNumber, applyRotationFromInputs);

	resetRotation.addEventListener('click', () => {
		modelPivot.rotation.set(0, 0, 0);
		syncRotationInputsFromModel();
	});

	modelInput.addEventListener('change', handleModelUpload);

	distanceModeRadios.forEach(radio => {
		radio.addEventListener('change', () => {
			updateUIVisibility();
			updateCameraFromControls();
		});
	});

	let isDragging = false;
	let lastX = 0;
	let lastY = 0;
	const maxPitch = Math.PI / 2;
	const dragSensitivity = 0.01;

	renderer.domElement.addEventListener('pointerdown', event => {
		if (event.button !== 0) {
			return;
		}
		isDragging = true;
		lastX = event.clientX;
		lastY = event.clientY;
		container.classList.add('dragging');
		renderer.domElement.setPointerCapture(event.pointerId);
	});

	renderer.domElement.addEventListener('pointermove', event => {
		if (!isDragging) {
			return;
		}
		const dx = event.clientX - lastX;
		const dy = event.clientY - lastY;
		lastX = event.clientX;
		lastY = event.clientY;

		modelPivot.rotation.y += dx * dragSensitivity;
		modelPivot.rotation.x += dy * dragSensitivity;
		modelPivot.rotation.x = Math.max(-maxPitch, Math.min(maxPitch, modelPivot.rotation.x));
		syncRotationInputsFromModel();
	});

	function stopDragging(event) {
		if (!isDragging) {
			return;
		}
		isDragging = false;
		container.classList.remove('dragging');
		renderer.domElement.releasePointerCapture(event.pointerId);
	}

	renderer.domElement.addEventListener('pointerup', stopDragging);
	renderer.domElement.addEventListener('pointercancel', stopDragging);
	renderer.domElement.addEventListener('pointerleave', stopDragging);

	setActiveModel(createDefaultModel());
	setModelStatus('No model uploaded (showing default cube)');
	setFocalLengthMm(lensCustom.value);
	updateUIVisibility();
	updateCameraFromControls();
	syncRotationInputsFromModel();

	function animate() {
		renderer.render(scene, camera);
		requestAnimationFrame(animate);
	}

	animate();
})();

